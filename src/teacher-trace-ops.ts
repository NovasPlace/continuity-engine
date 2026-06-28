import type { BridgeDeps } from './bridge-ops.js';
import type { TeacherTraceSeedInput, TeacherTraceSeedResult } from './teacher-trace-types.js';
import { previewTeacherTraces, seedTeacherTraces } from './teacher-trace-seeder.js';

export async function previewTeacherTracesOp(
  deps: BridgeDeps,
  input: TeacherTraceSeedInput,
): Promise<TeacherTraceSeedResult> {
  ensureDatabase(deps);
  return previewTeacherTraces(deps.database!.getPool(), input);
}

export async function seedTeacherTracesOp(
  deps: BridgeDeps,
  input: TeacherTraceSeedInput,
): Promise<TeacherTraceSeedResult> {
  ensureDatabase(deps);
  return seedTeacherTraces(deps.database!.getPool(), deps.memoryManager, input);
}

function ensureDatabase(deps: BridgeDeps): asserts deps is BridgeDeps & { database: NonNullable<BridgeDeps['database']> } {
  if (!deps.database) {
    throw new Error('Database is required for teacher trace operations');
  }
}
