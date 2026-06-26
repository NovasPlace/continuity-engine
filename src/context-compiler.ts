/**
 * Phase 5: Context Compiler — Input Token Governor
 *
 * Keeps input under a configurable budget by compressing low-value context
 * while preserving high-signal information (errors, active files, constraints).
 *
 * Architecture: raw messages → classify importance → preserve pinned → compress → send
 * Transparency: every compression produces a CompressedPartDetail with risk + preserved signals
 */
import { estimateTokens } from './token-bucket-analyzer.js';
import type { ContextCompilerConfig, BudgetMode, CompressedPartDetail } from './types.js';

export interface CompileResult {
  beforeTokens: number;
  afterTokens: number;
  budget: number;
  partsCompressed: number;
  partsPinned: number;
  mode: BudgetMode;
  compressedDetails: CompressedPartDetail[];
  pinnedCategories: Record<string, number>;
}

const ALREADY_COMPACTED = ['[COMPACTED_TOOL]', '[COMPRESSED]'];
const STEP_TYPES = ['step-start', 'step-finish', 'compaction', 'reasoning', 'snapshot', 'patch'];

function isAlreadyCompressed(part: any): boolean {
  const text = part.text ?? part.state?.output ?? '';
  return ALREADY_COMPACTED.some(m => String(text).startsWith(m));
}

/** Returns pinned category string or 'compressible' */
function classifyPart(
  part: any, msgIndex: number, totalMsgs: number, role: string, recentWindow: number,
): string {
  if (isAlreadyCompressed(part)) return 'compressible';
  if (role === 'user') return 'user_message';
  if (msgIndex >= totalMsgs - recentWindow) return 'recent_turn';
  if (part.type === 'tool' && (part.state?.status === 'error' || part.state?.type === 'error')) return 'error';
  if (STEP_TYPES.includes(part.type)) return 'step_type';
  if (part.type === 'tool' && (part.state?.status === 'completed' || part.state?.type === 'completed')) {
    if (estimateTokens(String(part.state.output ?? '')) > 100) return 'compressible';
    if (msgIndex < totalMsgs - recentWindow * 2) return 'compressible';
    return 'short_tool_output';
  }
  if (part.type === 'text') {
    if (estimateTokens(String(part.text ?? '')) > 200) return 'compressible';
    if (msgIndex < totalMsgs - recentWindow * 3) return 'compressible';
    return 'short_text';
  }
  return 'other';
}

function estimateMessageTokens(messages: { parts?: any[] }[]): number {
  let total = 0;
  for (const msg of messages) {
    for (const part of msg.parts ?? []) {
      total += estimateTokens(String(part.text ?? part.state?.output ?? ''));
    }
  }
  return total;
}

function buildToolSummary(tool: string, input: any, lines: number): string {
  switch (tool) {
    case 'read': return `[TOOL:read] ${input.filePath ?? ''} — ${lines} lines`;
    case 'write': case 'edit': return `[TOOL:${tool}] ${input.filePath ?? ''} — applied`;
    case 'bash': return `[TOOL:bash] "${String(input.command ?? '').slice(0, 60)}" — ${lines} lines`;
    case 'grep': case 'glob': return `[TOOL:${tool}] "${String(input.pattern ?? '').slice(0, 40)}" — ${lines} results`;
    case 'task': return `[TOOL:task] "${String(input.description ?? '').slice(0, 50)}" — completed`;
    default: return `[TOOL:${tool}] — ${lines} lines output`;
  }
}

function toolRiskAndSignals(tool: string, input: any, before: number): { risk: CompressedPartDetail['risk']; reason: string; signals: string[] } {
  if (tool === 'read') return { risk: 'low', reason: before > 1000 ? 'large_log' : 'old_tool_output', signals: ['file_path', 'line_count'] };
  if (tool === 'bash') return { risk: 'low', reason: 'large_log', signals: ['command', 'line_count'] };
  if (tool === 'edit' || tool === 'write') return { risk: 'medium', reason: 'old_tool_output', signals: ['file_path', 'status'] };
  if (tool === 'grep' || tool === 'glob') return { risk: 'low', reason: 'old_tool_output', signals: ['pattern', 'result_count'] };
  return { risk: 'low', reason: 'old_tool_output', signals: ['tool_name', 'line_count'] };
}

function compressToolOutput(part: any): CompressedPartDetail | null {
  if (part.state?.status !== 'completed' && part.state?.type !== 'completed') return null;
  const before = estimateTokens(String(part.state.output ?? ''));
  const tool = part.tool ?? 'unknown';
  const input = part.state?.input ?? {};
  const output = String(part.state.output ?? '');
  const lines = output.split('\n').length;
  const summary = buildToolSummary(tool, input, lines);
  part.state.output = summary;
  const after = estimateTokens(summary);
  const meta = toolRiskAndSignals(tool, input, before);
  return {
    kind: `tool_${tool}`, source: input.filePath ?? input.command ?? input.pattern ?? '',
    reason: before > 100 ? meta.reason : 'old_short_tool_output', beforeTokens: before, afterTokens: after,
    compressionRatio: before > 0 ? after / before : 0, preservedSignals: meta.signals, risk: meta.risk,
  };
}

function compressTextPart(part: any): CompressedPartDetail | null {
  if (part.type !== 'text') return null;
  const text = String(part.text ?? '');
  const before = estimateTokens(text);
  if (before < 200) return null;
  const keep = text.slice(0, 500);
  part.text = `${keep}\n[COMPRESSED_CONTEXT: ${before} tok → ~${Math.ceil(keep.length / 4)} tok]`;
  const after = estimateTokens(part.text);
  return {
    kind: 'assistant_text', source: '', reason: 'stale_turn',
    beforeTokens: before, afterTokens: after, compressionRatio: after / before,
    preservedSignals: ['first_500_chars'], risk: 'low',
  };
}

function classifyAndCollect(
  messages: { info?: { role?: string }; parts?: any[] }[], recentWindow: number,
): { candidates: { part: any; tokens: number }[]; pinnedCategories: Record<string, number> } {
  const candidates: { part: any; tokens: number }[] = [];
  const pinnedCategories: Record<string, number> = {};
  const totalMsgs = messages.length;
  for (let i = 0; i < totalMsgs; i++) {
    const role = messages[i].info?.role ?? 'unknown';
    for (const part of messages[i].parts ?? []) {
      const cls = classifyPart(part, i, totalMsgs, role, recentWindow);
      if (cls === 'compressible') {
        candidates.push({ part, tokens: estimateTokens(String(part.text ?? part.state?.output ?? '')) });
      } else {
        pinnedCategories[cls] = (pinnedCategories[cls] ?? 0) + 1;
      }
    }
  }
  return { candidates, pinnedCategories };
}

function compressToFit(
  candidates: { part: any; tokens: number }[], target: number,
): { saved: number; details: CompressedPartDetail[] } {
  candidates.sort((a, b) => b.tokens - a.tokens);
  let saved = 0;
  const details: CompressedPartDetail[] = [];
  for (const c of candidates) {
    if (saved >= target) break;
    const detail = c.part.type === 'tool' ? compressToolOutput(c.part) : compressTextPart(c.part);
    if (detail) { saved += detail.beforeTokens - detail.afterTokens; details.push(detail); }
  }
  return { saved, details };
}

/** Compile messages to fit within a token budget. */
export function compileContext(
  messages: { info?: { role?: string }; parts?: any[] }[], config: ContextCompilerConfig,
): CompileResult {
  const empty: CompileResult = {
    beforeTokens: 0, afterTokens: 0, budget: 0, partsCompressed: 0, partsPinned: 0,
    mode: 'normal', compressedDetails: [], pinnedCategories: {},
  };
  if (!config.enabled) return empty;
  const budget = config.modes[config.defaultMode];
  const beforeTokens = estimateMessageTokens(messages);
  if (beforeTokens <= budget) {
    return { ...empty, beforeTokens, afterTokens: beforeTokens, budget, mode: config.defaultMode };
  }
  const { candidates, pinnedCategories } = classifyAndCollect(messages, config.recentTurnWindow);
  const { saved, details } = compressToFit(candidates, beforeTokens - budget);
  return {
    beforeTokens, afterTokens: beforeTokens - saved, budget,
    partsCompressed: details.length, partsPinned: Object.values(pinnedCategories).reduce((a, b) => a + b, 0),
    mode: config.defaultMode, compressedDetails: details, pinnedCategories,
  };
}

/** Format a compact status line for system prompt injection (Layer 1) */
export function formatStatusLine(result: CompileResult): string {
  const underBudget = result.afterTokens <= result.budget;
  const highRisk = result.compressedDetails.filter(d => d.risk === 'high').length;
  const riskFlag = highRisk > 0 ? ` ⚠${highRisk}high-risk` : '';
  return `[Context Compiler] ${result.mode} ${(result.beforeTokens / 1000).toFixed(1)}K→${(result.afterTokens / 1000).toFixed(1)}K | compressed=${result.partsCompressed} pinned=${result.partsPinned} under_budget=${underBudget}${riskFlag}`;
}
