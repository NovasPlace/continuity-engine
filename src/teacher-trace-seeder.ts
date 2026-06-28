import type { DatabasePool, MemorySaveOptions } from './types.js';
import type { MemoryManager } from './memory-manager.js';
import type { ResumeEntry } from './work-journal-types.js';
import type { TeacherTraceCard, TeacherTraceSeedInput, TeacherTraceSeedResult } from './teacher-trace-types.js';
import { deriveTeacherTraceCards, summarizeTeacherTraceSeed } from './teacher-trace-core.js';

export async function previewTeacherTraces(
  pool: DatabasePool,
  input: TeacherTraceSeedInput,
): Promise<TeacherTraceSeedResult> {
  const entries = await loadEntries(pool, input);
  return summarizeTeacherTraceSeed(entries, deriveTeacherTraceCards(entries), 0);
}

export async function seedTeacherTraces(
  pool: DatabasePool,
  memoryManager: MemoryManager,
  input: TeacherTraceSeedInput,
): Promise<TeacherTraceSeedResult> {
  const entries = await loadEntries(pool, input);
  const cards = deriveTeacherTraceCards(entries);
  let savedCount = 0;
  for (const card of cards) {
    await saveTeacherTrace(memoryManager, input.sessionId, input.projectId, card);
    savedCount++;
  }
  return summarizeTeacherTraceSeed(entries, cards, savedCount);
}

async function loadEntries(
  pool: DatabasePool,
  input: TeacherTraceSeedInput,
): Promise<ResumeEntry[]> {
  const result = await pool.query(
    `SELECT intent, target, result_summary, error_summary, files_touched, entry_type, tool_name, created_at
     FROM agent_work_journal
     WHERE session_id = $1
       AND ($2::text IS NULL OR project_id = $2)
     ORDER BY created_at ASC
     LIMIT $3`,
    [input.sessionId, input.projectId ?? null, input.limit ?? 50],
  );

  return result.rows.map((row) => mapEntry(row as Record<string, unknown>));
}

async function saveTeacherTrace(
  memoryManager: MemoryManager,
  sessionId: string,
  projectId: string | undefined,
  card: TeacherTraceCard,
): Promise<void> {
  const tags = ['teacher-trace', 'repair-card', ...card.triggerTools.map((tool) => `tool:${tool}`)];
  for (const file of card.triggerFiles) tags.push(`file:${file}`);

  const memory: MemorySaveOptions = {
    content: `${card.lesson}\nProblem: ${truncate(card.problem, 100)}\nFix: ${truncate(card.correction, 100)}`,
    type: 'lesson',
    importance: 0.85,
    emotion: 'frustration',
    confidence: 0.95,
    source: 'lesson',
    tags,
    metadata: {
      source: 'teacher_trace',
      problem: card.problem,
      correction: card.correction,
      lesson: card.lesson,
      evidence: card.evidence,
      triggers: {
        tools: card.triggerTools,
        files: card.triggerFiles,
        args: card.triggerArgPatterns,
      },
      projectId,
    },
    sessionId,
  };

  await memoryManager.saveMemory(memory);
}

function mapEntry(row: Record<string, unknown>): ResumeEntry {
  return {
    entryType: row.entry_type as ResumeEntry['entryType'],
    toolName: row.tool_name as string | undefined,
    intent: (row.intent as string) ?? '',
    target: row.target as string | undefined,
    resultSummary: row.result_summary as string | undefined,
    errorSummary: row.error_summary as string | undefined,
    filesTouched: Array.isArray(row.files_touched) ? row.files_touched.filter((v): v is string => typeof v === 'string') : [],
    createdAt: row.created_at as Date,
  };
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
