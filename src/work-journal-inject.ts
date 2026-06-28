import type { ResumePayload } from './work-journal-types.js';
import { estimateTokens } from './token-bucket-analyzer.js';

export interface WorkJournalInjectDeps {
  maxInjectTokens: number;
}

export function buildResumeInjection(
  payload: ResumePayload,
  deps: WorkJournalInjectDeps,
): string {
  const lines: string[] = [];
  const maxChars = deps.maxInjectTokens * 4;

  lines.push(`<work_resume from_session="${payload.fromSessionId.slice(0, 12)}" last_active="${payload.lastActiveAt.toISOString().substring(0, 19)}Z">`);
  lines.push('');
  lines.push(`## Prior Session Work (${payload.totalEntries} entries, ${payload.entries.length} most recent shown)`);
  lines.push('');

  let budgetUsed = 0;
  for (const entry of payload.entries) {
    if (budgetUsed > maxChars) break;

    const tag = entry.entryType;
    const tool = entry.toolName ? ` ${entry.toolName}` : '';
    const target = entry.target ? ` ${truncate(entry.target, 60)}` : '';
    const intent = truncate(entry.intent, 180);
    const result = entry.resultSummary ? ` — ${truncate(entry.resultSummary, 100)}` : '';
    const errTag = entry.errorSummary ? ` [ERROR: ${truncate(entry.errorSummary, 80)}]` : '';

    lines.push(`### [${tag}${tool}] ${intent}${target}${result}${errTag}`);
    budgetUsed += lines[lines.length - 1].length;
  }

  lines.push('');

  if (payload.activeGoal) {
    lines.push(`## Active Goal`);
    lines.push(payload.activeGoal);
    lines.push('');
  }

  if (payload.nextStepInferred) {
    lines.push(`## Inferred Next Step`);
    lines.push(payload.nextStepInferred);
    lines.push('');
  }

  if (payload.allFilesTouched.length > 0) {
    lines.push(`## Files Touched (prior session)`);
    for (const f of payload.allFilesTouched) {
      if (f.startsWith('search:')) continue;
      lines.push(`- ${f}`);
    }
    lines.push('');
  }

  lines.push('</work_resume>');

  const fullText = lines.join('\n');
  const tokens = estimateTokens(fullText);
  if (tokens > deps.maxInjectTokens) {
    const joinLen = lines.length;
    while (lines.length > 10 && estimateTokens(lines.join('\n')) > deps.maxInjectTokens) {
      lines.splice(Math.floor(lines.length / 2), 1);
    }
    lines.push('');
    lines.push(`[Resume truncated — ${joinLen - lines.length} entries omitted for budget]`);
    lines.push('</work_resume>');
    return lines.join('\n');
  }

  return fullText;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.substring(0, maxLen) + '...';
}
