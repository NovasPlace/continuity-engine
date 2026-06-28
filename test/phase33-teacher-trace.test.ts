import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deriveTeacherTraceCards, previewTeacherTraces, seedTeacherTraces } from '../src/teacher-trace.js';

function makeEntry(overrides: Record<string, unknown>) {
  return {
    entryType: 'tool_call' as const,
    toolName: 'bash',
    intent: 'Run: npm test',
    target: 'npm test',
    resultSummary: 'Build failed because the missing lesson was not seeded.',
    errorSummary: 'TypeError: build context lost after compaction',
    filesTouched: ['src/index.ts'],
    createdAt: new Date('2026-06-28T00:00:00.000Z'),
    ...overrides,
  };
}

function mockPool(rows: Record<string, unknown>[]) {
  return {
    query: async (sql: string) => {
      if (sql.includes('FROM agent_work_journal')) {
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

describe('Phase 33 teacher traces', () => {
  it('derives repair cards from real work-journal style entries', () => {
    const cards = deriveTeacherTraceCards([
      makeEntry({ intent: 'Run: npm test', resultSummary: 'Tests failed', errorSummary: 'Cannot read properties of undefined' }),
      makeEntry({
        entryType: 'decision',
        toolName: 'edit',
        intent: 'Patch src/index.ts',
        resultSummary: 'Added the null guard and reran the test.',
        errorSummary: undefined,
        filesTouched: ['src/index.ts'],
      }),
    ]);

    assert.equal(cards.length, 1);
    assert.match(cards[0].lesson, /reuse this correction next time/i);
    assert.ok(cards[0].triggerTools.includes('bash'));
    assert.ok(cards[0].triggerFiles.includes('.ts'));
  });

  it('preview and seed teacher traces from a journal trace', async () => {
    const saved: any[] = [];
    const pool = mockPool([
      {
        intent: 'Run: npm test',
        target: 'npm test',
        result_summary: 'Tests failed with a null guard regression.',
        error_summary: 'Cannot read properties of undefined',
        files_touched: ['src/index.ts'],
        entry_type: 'tool_call',
        tool_name: 'bash',
        created_at: new Date('2026-06-28T00:00:00.000Z'),
      },
      {
        intent: 'Patch the null guard and rerun the tests.',
        target: 'src/index.ts',
        result_summary: 'Build recovered and tests passed.',
        error_summary: null,
        files_touched: ['src/index.ts'],
        entry_type: 'decision',
        tool_name: 'edit',
        created_at: new Date('2026-06-28T00:05:00.000Z'),
      },
    ]);
    const db = { getPool: () => pool } as any;
    const memoryManager = {
      saveMemory: async (input: any) => { saved.push(input); return { id: 1 }; },
    } as any;

    const preview = await previewTeacherTraces(db.getPool(), {
      sessionId: 'sess-1',
      projectId: 'proj-1',
      limit: 10,
    });
    const seeded = await seedTeacherTraces(db.getPool(), memoryManager, {
      sessionId: 'sess-1',
      projectId: 'proj-1',
      limit: 10,
    });

    assert.equal(preview.cards.length, 1);
    assert.equal(seeded.savedCount, 1);
    assert.ok(seeded.rawJournalTokens > 0);
    assert.ok(seeded.reductionPercent >= 0);
    assert.match(saved[0].content, /Build recovered/i);
    assert.ok(saved[0].tags.includes('teacher-trace'));
    assert.equal(saved[0].metadata.triggers.tools[0], 'bash');
  });
});
