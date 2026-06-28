export interface TeacherTraceCard {
  title: string;
  problem: string;
  correction: string;
  lesson: string;
  evidence: string[];
  filesTouched: string[];
  commandsRun: string[];
  triggerTools: string[];
  triggerFiles: string[];
  triggerArgPatterns: Record<string, string>;
}

export interface TeacherTraceSeedInput {
  sessionId: string;
  projectId?: string;
  limit?: number;
}

export interface TeacherTraceSeedResult {
  cards: TeacherTraceCard[];
  savedCount: number;
  skippedCount: number;
  rawJournalTokens: number;
  teacherTraceTokens: number;
  reductionPercent: number;
}
