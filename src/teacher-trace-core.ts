import type { ResumeEntry } from './work-journal-types.js';
import { estimateTokens } from './token-bucket-analyzer.js';
import type { TeacherTraceCard, TeacherTraceSeedResult } from './teacher-trace-types.js';

export function deriveTeacherTraceCards(entries: ResumeEntry[]): TeacherTraceCard[] {
  const ordered = [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const cards: TeacherTraceCard[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const entry = ordered[i];
    if (!isTraceSeed(entry)) continue;
    cards.push(buildCard(entry, findNeighborFix(ordered, i)));
    if (cards.length >= 3) break;
  }

  if (cards.length === 0) {
    const fallback = ordered.at(-1);
    if (fallback) cards.push(buildFallbackCard(fallback));
  }

  return cards.slice(0, 3);
}

export function formatTeacherTraceCards(cards: TeacherTraceCard[]): string {
  if (cards.length === 0) return '[No teacher traces derived]';
  return cards.map((card, index) => formatTeacherTraceCard(card, index + 1)).join('\n\n');
}

export function summarizeTeacherTraceSeed(
  entries: ResumeEntry[],
  cards: TeacherTraceCard[],
  savedCount: number,
): TeacherTraceSeedResult {
  const rawJournalTokens = estimateTokens(entries.map(formatResumeEntry).join('\n'));
  const teacherTraceTokens = estimateTokens(formatTeacherTraceCards(cards));
  const reductionPercent = rawJournalTokens > 0
    ? Math.max(0, ((rawJournalTokens - teacherTraceTokens) / rawJournalTokens) * 100)
    : 0;
  return {
    cards,
    savedCount,
    skippedCount: Math.max(0, entries.length - cards.length),
    rawJournalTokens,
    teacherTraceTokens,
    reductionPercent,
  };
}

function buildCard(entry: ResumeEntry, fixEntry?: ResumeEntry): TeacherTraceCard {
  const filesTouched = uniqueStrings(entry.filesTouched);
  const commandsRun = entry.toolName === 'bash' && entry.target ? [entry.target] : [];
  const toolName = entry.toolName ?? 'work-journal';
  const problem = clean(entry.errorSummary ?? entry.resultSummary ?? entry.intent);
  const correction = clean(fixEntry?.resultSummary ?? fixEntry?.intent ?? entry.resultSummary ?? 'Preserve the working fix and avoid repeating the failing approach.');

  return {
    title: `Repair card: ${toolName}`,
    problem,
    correction,
    lesson: `Reuse this correction next time: ${truncate(correction, 80)}`,
    evidence: compactEvidence(entry, fixEntry),
    filesTouched,
    commandsRun,
    triggerTools: toolName ? [toolName] : [],
    triggerFiles: fileTriggers(filesTouched),
    triggerArgPatterns: buildArgTriggers(entry),
  };
}

function buildFallbackCard(entry: ResumeEntry): TeacherTraceCard {
  return {
    title: `Teacher trace: ${entry.toolName ?? 'work-journal'}`,
    problem: clean(entry.intent),
    correction: clean(entry.resultSummary ?? 'Continue from the recorded work journal state.'),
    lesson: `Reuse the recorded working shape instead of rebuilding from scratch.`,
    evidence: compactEvidence(entry),
    filesTouched: uniqueStrings(entry.filesTouched),
    commandsRun: entry.toolName === 'bash' && entry.target ? [entry.target] : [],
    triggerTools: entry.toolName ? [entry.toolName] : [],
    triggerFiles: fileTriggers(entry.filesTouched),
    triggerArgPatterns: buildArgTriggers(entry),
  };
}

function buildArgTriggers(entry: ResumeEntry): Record<string, string> {
  if (entry.toolName !== 'bash' || !entry.target) return {};
  return { command: escapeRegex(entry.target.slice(0, 80)) };
}

function compactEvidence(entry: ResumeEntry, fixEntry?: ResumeEntry): string[] {
  const evidence = [entry.intent, entry.resultSummary, entry.errorSummary, fixEntry?.intent, fixEntry?.resultSummary]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map(clean);
  return uniqueStrings(evidence).slice(0, 5);
}

function fileTriggers(files: string[]): string[] {
  return uniqueStrings(files.map((file) => {
    const dot = file.lastIndexOf('.');
    return dot >= 0 ? file.slice(dot) : file;
  }).filter((file) => file.length > 0));
}

function findNeighborFix(entries: ResumeEntry[], index: number): ResumeEntry | undefined {
  for (let i = index + 1; i < Math.min(entries.length, index + 4); i++) {
    const candidate = entries[i];
    if (candidate.entryType === 'decision' || candidate.entryType === 'milestone' || candidate.resultSummary) {
      return candidate;
    }
  }
  return undefined;
}

function isTraceSeed(entry: ResumeEntry): boolean {
  return Boolean(entry.errorSummary)
    || entry.entryType === 'error'
    || /fail|error|fix|bug|retry/i.test(entry.intent)
    || /fail|error/i.test(entry.resultSummary ?? '');
}

function formatTeacherTraceCard(card: TeacherTraceCard, index: number): string {
  return [
    `### Repair card ${index}: ${card.title}`,
    `Problem: ${truncate(card.problem, 72)}`,
    `Fix: ${truncate(card.correction, 72)}`,
    `Lesson: ${truncate(card.lesson, 72)}`,
    card.evidence.length > 0 ? `Evidence: ${truncate(card.evidence.join(' | '), 96)}` : 'Evidence: none',
  ].join('\n');
}

function formatResumeEntry(entry: ResumeEntry): string {
  return [
    `[${entry.entryType}] ${entry.toolName ?? 'journal'}`,
    entry.intent,
    entry.target ? `target=${entry.target}` : '',
    entry.resultSummary ?? '',
    entry.errorSummary ?? '',
    entry.filesTouched.join(', '),
  ].filter((part) => part.length > 0).join(' | ');
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => clean(value)).filter((value) => value.length > 0))];
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
