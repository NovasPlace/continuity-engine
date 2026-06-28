export type WorkJournalEntryType =
  | 'tool_call'
  | 'decision'
  | 'file_change'
  | 'error'
  | 'milestone'
  | 'session_end';

export interface WorkJournalEntry {
  id?: number;
  sessionId: string;
  projectId?: string;
  entryType: WorkJournalEntryType;
  toolName?: string;
  intent: string;
  target?: string;
  resultSummary?: string;
  errorSummary?: string;
  filesTouched: string[];
  tokenSnapshot?: number;
  createdAt?: Date;
}

export interface WorkJournalConfig {
  enabled: boolean;
  maxResumeEntries: number;
  maxIntentChars: number;
  injectMaxTokens: number;
  autoMarkMilestone: boolean;
  persistOnDispose: boolean;
}

export interface ResumePayload {
  fromSessionId: string;
  fromProjectId?: string;
  lastActiveAt: Date;
  totalEntries: number;
  entries: ResumeEntry[];
  activeGoal?: string;
  nextStepInferred?: string;
  allFilesTouched: string[];
  tokenCount: number;
}

export interface ResumeEntry {
  entryType: WorkJournalEntryType;
  toolName?: string;
  intent: string;
  target?: string;
  resultSummary?: string;
  errorSummary?: string;
  filesTouched: string[];
  createdAt: Date;
}

const MILESTONE_PATTERNS = [
  /implemented?\s+/i,
  /completed?\s+/i,
  /fixed?\s+/i,
  /resolved?\s+/i,
  /added?\s+/i,
  /removed?\s+/i,
  /refactored?\s+/i,
  /all\s+(tests?\s+)?pass/i,
  /\d+\s+fail/i,
  /deployed?\s+/i,
  /shipped?\s+/i,
  /milestone/i,
  /landed?\s+/i,
];

export function isMilestoneIntent(text: string): boolean {
  return MILESTONE_PATTERNS.some(p => p.test(text));
}

const ERROR_PATTERNS = [
  /error/i,
  /fail/i,
  /exception/i,
  /crash/i,
  /timeout/i,
  /reject/i,
  /denied/i,
  /cannot/i,
  /unable/i,
];

export function isErrorResult(text: string): boolean {
  return ERROR_PATTERNS.some(p => p.test(text));
}

export function inferNextStep(entries: ResumeEntry[]): string | undefined {
  if (entries.length === 0) return undefined;

  const last = entries[0];
  if (!last) return undefined;

  if (last.entryType === 'error' || last.errorSummary) {
    return `Fix error: ${last.errorSummary ?? last.intent}`;
  }

  if (last.entryType === 'tool_call' && last.toolName === 'bash') {
    if (last.resultSummary && /fail|error/i.test(last.resultSummary)) {
      return `Fix test/command failure from: ${last.intent}`;
    }
  }

  if (last.entryType === 'milestone') {
    const prior = entries[1];
    if (prior && prior.entryType === 'tool_call') {
      return `Continue after milestone: ${last.intent}`;
    }
    return `Milestone reached: ${last.intent}`;
  }

  if (last.entryType === 'file_change' || (last.toolName === 'edit' || last.toolName === 'write')) {
    const files = last.filesTouched.length > 0 ? last.filesTouched.join(', ') : last.target ?? 'unknown file';
    return `Continue work on: ${files}`;
  }

  return last.intent;
}

export function collectAllFiles(entries: ResumeEntry[]): string[] {
  const files = new Set<string>();
  for (const entry of entries) {
    for (const f of entry.filesTouched) {
      files.add(f);
    }
    if (entry.target && entry.entryType === 'file_change') {
      files.add(entry.target);
    }
  }
  return [...files].sort();
}
