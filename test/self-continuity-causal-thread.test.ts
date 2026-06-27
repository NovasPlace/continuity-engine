import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CausalThreadHydrator,
  classifyRole,
  type CausalThreadResult,
  type HydrateCausalThreadOptions,
} from '../src/self-continuity-causal-thread.js';

interface MockRow {
  [key: string]: unknown;
}

type QueryHandler = (sql: string, params?: unknown[]) => { rows: MockRow[] };

function makePool(handler: QueryHandler) {
  const pool = {
    query: handler,
    connect: () => ({ query: handler, release: () => {} }),
  };
  return pool as unknown as Parameters<typeof CausalThreadHydrator.prototype.constructor.arguments[0] extends infer T ? any : any>;
}

function mkPool(handler: QueryHandler): any {
  return {
    query: handler,
    connect: () => ({ query: handler, release: () => {} }),
  };
}

const MEMORY_COLS = ['id', 'content', 'type', 'session_id', 'project_id', 'created_at'];

describe('classifyRole', () => {
  it('classifies problem keywords', () => {
    assert.equal(classifyRole('There was an error in the build'), 'problem');
    assert.equal(classifyRole('The test failed'), 'problem');
  });
  it('classifies action keywords', () => {
    assert.equal(classifyRole('Fixed the bug in the auth module'), 'action');
    assert.equal(classifyRole('Implemented the hydration layer'), 'action');
  });
  it('classifies result keywords', () => {
    assert.equal(classifyRole('All 57 tests passed green'), 'result');
    assert.equal(classifyRole('Pushed to origin master'), 'result');
  });
  it('classifies lesson keywords', () => {
    assert.equal(classifyRole('LESSON: detected loop, need to check args'), 'lesson');
    assert.equal(classifyRole('Learned that redactor needs 20+ chars'), 'lesson');
  });
  it('classifies decision keywords', () => {
    assert.equal(classifyRole('Decision: lower the stable threshold to 0.5'), 'decision');
    assert.equal(classifyRole('Trade-off: adds evaluation overhead'), 'decision');
  });
  it('classifies downstream changes', () => {
    assert.equal(classifyRole('Because of the garbled edit README was updated'), 'downstream_change');
    assert.equal(classifyRole('The hydration layer caused by the lossy summary gap'), 'downstream_change');
  });
  it('falls back to landmark', () => {
    assert.equal(classifyRole('Pushed commit 52d338f to the repository'), 'result');
  });
});

describe('CausalThreadHydrator — full chain', () => {
  it('builds a problem -> action -> result thread with causal links', async () => {
    const t0 = new Date('2026-06-27T05:00:00Z');
    const t1 = new Date('2026-06-27T05:01:00Z');
    const t2 = new Date('2026-06-27T05:02:00Z');
    const t3 = new Date('2026-06-27T05:03:00Z');

    const memories = [
      { id: 44041, content: 'Phase 23 hydration test failed with ERR_ASSERTION', type: 'workspace', session_id: 'ses-f', project_id: null, created_at: t0 },
      { id: 44042, content: 'Fixed the redaction placeholder from [REDACTED] to [REDACTED_SECRET]', type: 'conversation', session_id: 'ses-f', project_id: null, created_at: t1 },
      { id: 44043, content: 'All 11 tests passed green after the redaction fix', type: 'conversation', session_id: 'ses-f', project_id: null, created_at: t2 },
      { id: 44044, content: 'Decision: redactor placeholder is [REDACTED_SECRET] not [REDACTED]', type: 'decision', session_id: 'ses-f', project_id: null, created_at: t3 },
    ];

    const links = [
      { from: 44041, to: 44042, link_type: 'causal' },
      { from: 44042, to: 44043, link_type: 'causal' },
    ];

    const pool = mkPool((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM memories WHERE id = $1') && !sql.includes('memory_links') && !sql.includes('ABS')) {
        const id = params?.[0] as number;
        const mem = memories.find(m => m.id === id);
        return { rows: mem ? [mem] : [] };
      }
      if (sql.includes('RECURSIVE') && sql.includes('memory_links')) {
        const rootId = params?.[0] as number;
        const result: MockRow[] = [];
        for (const link of links) {
          if (link.from === rootId) {
            const mem = memories.find(m => m.id === link.to);
            if (mem) result.push({ id: mem.id, content: mem.content, type: mem.type, created_at: mem.created_at, link_type: link.link_type });
          }
          const downstream = links.find(l => l.from === link.to);
          if (downstream) {
            const mem = memories.find(m => m.id === downstream.to);
            if (mem && !result.find(r => r.id === mem.id)) {
              result.push({ id: mem.id, content: mem.content, type: mem.type, created_at: mem.created_at, link_type: downstream.link_type });
            }
          }
        }
        return { rows: result.filter(r => r.id !== rootId) };
      }
      if (sql.includes('ABS(EXTRACT')) {
        const rootId = params?.[1] as number;
        const lim = params?.[2] as number;
        const rootMem = memories.find(m => m.id === rootId);
        if (!rootMem) return { rows: [] };
        const sess = memories.filter(m => m.id !== rootId && m.session_id === rootMem.session_id).slice(0, lim);
        return { rows: sess };
      }
      if (sql.includes("content ILIKE '%decision%'")) {
        const decs = memories.filter(m => m.type === 'decision' || /decision/i.test(m.content)).slice(0, 3);
        return { rows: decs };
      }
      if (sql.includes("type = 'lesson'")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const hydrator = new CausalThreadHydrator(pool);
    const result = await hydrator.hydrateCausalThread({ memoryId: 44041, sessionId: 'ses-f', radius: 5 });

    assert.equal(result.rootMemoryId, 44041);
    assert.ok(result.thread.length >= 3, `expected >=3 nodes, got ${result.thread.length}`);
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.budgetExceeded, false);

    const roles = result.thread.map(n => n.role);
    assert.ok(roles.includes('problem'), 'should include problem');
    assert.ok(roles.includes('action'), 'should include action');
    assert.ok(roles.includes('result') || roles.includes('downstream_change'), 'should include result or downstream');

    const probs = result.thread.filter(n => n.role === 'problem');
    assert.equal(probs.length, 1);
    assert.equal(probs[0].memoryId, 44041);

    assert.ok(result.confidence > 0, 'confidence should be positive');
    assert.ok(result.reconstructionSummary.includes('Causal Thread around #44041'));
  });
});

describe('CausalThreadHydrator — broken chain', () => {
  it('reports orphan_thread when root memory not found', async () => {
    const pool = mkPool(() => ({ rows: [] }));
    const hydrator = new CausalThreadHydrator(pool);
    const result = await hydrator.hydrateCausalThread({ memoryId: 99999 });

    assert.equal(result.thread.length, 0);
    assert.ok(result.gaps.some(g => g.kind === 'orphan_thread'));
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.confidence, 0);
  });

  it('reports missing_link when temporal adjacency only and no causal links', async () => {
    const t0 = new Date('2026-06-27T05:00:00Z');
    const t1 = new Date('2026-06-27T05:01:00Z');

    const memories = [
      { id: 50001, content: 'Reading some file about the schema', type: 'workspace', session_id: 'ses-x', project_id: null, created_at: t0 },
      { id: 50002, content: 'Reviewed the database types file', type: 'workspace', session_id: 'ses-x', project_id: null, created_at: t1 },
    ];

    const pool = mkPool((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM memories WHERE id = $1') && !sql.includes('memory_links') && !sql.includes('ABS')) {
        const id = params?.[0] as number;
        const mem = memories.find(m => m.id === id);
        return { rows: mem ? [mem] : [] };
      }
      if (sql.includes('RECURSIVE')) return { rows: [] };
      if (sql.includes('ABS(EXTRACT')) {
        const rootId = params?.[1] as number;
        const lim = params?.[2] as number;
        const rootMem = memories.find(m => m.id === rootId);
        if (!rootMem) return { rows: [] };
        return { rows: memories.filter(m => m.id !== rootId && m.session_id === rootMem.session_id).slice(0, lim) };
      }
      if (sql.includes("content ILIKE '%decision%'")) return { rows: [] };
      if (sql.includes("type = 'lesson'")) return { rows: [] };
      return { rows: [] };
    });

    const hydrator = new CausalThreadHydrator(pool);
    const result = await hydrator.hydrateCausalThread({ memoryId: 50001, sessionId: 'ses-x' });

    assert.ok(result.thread.length >= 2, 'should have temporal neighbors');
    const temporal = result.thread.filter(n => n.linkType === 'temporal');
    assert.ok(temporal.length > 0, 'should have temporal-adjacent nodes');
    const causal = result.thread.filter(n => n.linkType === 'causal');
    assert.equal(causal.length, 0, 'should have no causal links');
    assert.ok(result.gaps.some(g => g.kind === 'missing_link'), 'should report missing causal link');
  });

  it('reports missing_result when action exists without outcome', async () => {
    const t0 = new Date('2026-06-27T05:00:00Z');
    const t1 = new Date('2026-06-27T05:01:00Z');
    const memories = [
      { id: 60001, content: 'Implemented the causal thread hydrator', type: 'conversation', session_id: 'ses-y', project_id: null, created_at: t0 },
      { id: 60002, content: 'Started writing the integration tests', type: 'workspace', session_id: 'ses-y', project_id: null, created_at: t1 },
    ];

    const pool = mkPool((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM memories WHERE id = $1') && !sql.includes('memory_links') && !sql.includes('ABS')) {
        const id = params?.[0] as number;
        const mem = memories.find(m => m.id === id);
        return { rows: mem ? [mem] : [] };
      }
      if (sql.includes('RECURSIVE')) return { rows: [] };
      if (sql.includes('ABS(EXTRACT')) {
        const rootId = params?.[1] as number;
        const lim = params?.[2] as number;
        const rootMem = memories.find(m => m.id === rootId);
        if (!rootMem) return { rows: [] };
        return { rows: memories.filter(m => m.id !== rootId && m.session_id === rootMem.session_id).slice(0, lim) };
      }
      if (sql.includes("content ILIKE '%decision%'")) return { rows: [] };
      if (sql.includes("type = 'lesson'")) return { rows: [] };
      return { rows: [] };
    });

    const hydrator = new CausalThreadHydrator(pool);
    const result = await hydrator.hydrateCausalThread({ memoryId: 60001, sessionId: 'ses-y' });

    const actions = result.thread.filter(n => n.role === 'action');
    assert.ok(actions.length > 0, 'should have an action node');
    assert.ok(result.gaps.some(g => g.kind === 'missing_result'), 'should report missing result');
  });
});

describe('CausalThreadHydrator — partial chain with lessons', () => {
  it('attaches lessons and decisions as thread nodes', async () => {
    const t0 = new Date('2026-06-27T05:00:00Z');
    const t1 = new Date('2026-06-27T05:01:00Z');
    const t2 = new Date('2026-06-27T05:02:00Z');
    const memories = [
      { id: 70001, content: 'Implementing the hydration layer', type: 'conversation', session_id: 'ses-z', project_id: null, created_at: t0 },
      { id: 70002, content: 'LESSON: redactor placeholder is [REDACTED_SECRET] not [REDACTED]', type: 'lesson', session_id: 'ses-z', project_id: null, created_at: t1 },
      { id: 70003, content: 'Decision: redactor placeholder fixed for all integration tests', type: 'decision', session_id: 'ses-z', project_id: null, created_at: t2 },
    ];

    const pool = mkPool((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM memories WHERE id = $1') && !sql.includes('memory_links') && !sql.includes('ABS')) {
        const id = params?.[0] as number;
        const mem = memories.find(m => m.id === id);
        return { rows: mem ? [mem] : [] };
      }
      if (sql.includes('RECURSIVE')) return { rows: [] };
      if (sql.includes('ABS(EXTRACT')) {
        const rootId = params?.[1] as number;
        const lim = params?.[2] as number;
        const rootMem = memories.find(m => m.id === rootId);
        if (!rootMem) return { rows: [] };
        return { rows: memories.filter(m => m.id !== rootId && m.session_id === rootMem.session_id).slice(0, lim) };
      }
      if (sql.includes("content ILIKE '%decision%'")) {
        return { rows: memories.filter(m => /decision/i.test(m.content) || m.type === 'decision').slice(0, 3) };
      }
      if (sql.includes("type = 'lesson'")) {
        return { rows: memories.filter(m => m.type === 'lesson').slice(0, 3) };
      }
      return { rows: [] };
    });

    const hydrator = new CausalThreadHydrator(pool);
    const result = await hydrator.hydrateCausalThread({ memoryId: 70001, sessionId: 'ses-z', radius: 5 });

    const roles = result.thread.map(n => n.role);
    assert.ok(roles.includes('lesson'), 'should include a lesson node');
    assert.ok(roles.includes('decision'), 'should include a decision node');
  });
});

describe('CausalThreadHydrator — redaction', () => {
  it('applies redaction to thread summaries', async () => {
    const t0 = new Date('2026-06-27T05:00:00Z');
    const secret = 'sk-proj-' + 'a'.repeat(30);
    const memories = [
      { id: 80001, content: `Working with API key ${secret} on the integration`, type: 'conversation', session_id: 'ses-r', project_id: null, created_at: t0 },
    ];

    const pool = mkPool((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM memories WHERE id = $1') && !sql.includes('memory_links') && !sql.includes('ABS')) {
        const id = params?.[0] as number;
        const mem = memories.find(m => m.id === id);
        return { rows: mem ? [mem] : [] };
      }
      return { rows: [] };
    });

    const hydrator = new CausalThreadHydrator(pool);
    const result = await hydrator.hydrateCausalThread({ memoryId: 80001, sessionId: 'ses-r' });

    const root = result.thread.find(n => n.memoryId === 80001);
    assert.ok(root, 'root should exist');
    assert.ok(!root!.summary.includes(secret), 'secret should be redacted from summary');
    assert.ok(root!.summary.includes('[REDACTED'), 'should contain redaction placeholder');
  });
});

describe('CausalThreadHydrator — budget', () => {
  it('enforces max token budget and marks budgetExceeded', async () => {
    const base = new Date('2026-06-27T05:00:00Z');
    const memories: MockRow[] = [];
    for (let i = 1; i <= 20; i++) {
      memories.push({
        id: 90000 + i,
        content: `Memory ${i} `.repeat(80) + 'implements hydration layer updates',
        type: 'workspace',
        session_id: 'ses-b',
        project_id: null,
        created_at: new Date(base.getTime() + i * 1000),
      });
    }

    const pool = mkPool((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM memories WHERE id = $1') && !sql.includes('memory_links') && !sql.includes('ABS')) {
        const id = params?.[0] as number;
        const mem = memories.find(m => m.id === id) as MockRow | undefined;
        return { rows: mem ? [mem] : [] };
      }
      if (sql.includes('ABS(EXTRACT')) {
        const rootId = params?.[1] as number;
        const lim = params?.[2] as number;
        const rootMem = memories.find(m => m.id === rootId);
        if (!rootMem) return { rows: [] };
        return { rows: memories.filter(m => m.id !== rootId && (m as MockRow).session_id === (rootMem as MockRow).session_id).slice(0, lim) };
      }
      return { rows: [] };
    });

    const hydrator = new CausalThreadHydrator(pool);
    const result = await hydrator.hydrateCausalThread({ memoryId: 90001, sessionId: 'ses-b', maxTokens: 200 });

    assert.ok(result.budgetExceeded, 'budget should be exceeded');
    assert.ok(result.thread.length < 20, 'thread should be truncated');
    let totalChars = 0;
    for (const n of result.thread) totalChars += n.summary.length;
    assert.ok(totalChars <= 200 * 4 + 80, 'should stay roughly within budget');
  });
});

describe('CausalThreadHydrator — no blocking on failure', () => {
  it('returns fallback result without throwing when pool throws', async () => {
    const pool = mkPool(() => {
      throw new Error('connection refused');
    });
    const hydrator = new CausalThreadHydrator(pool);
    const result = await hydrator.hydrateCausalThread({ memoryId: 123 });

    assert.equal(result.fallbackUsed, true);
    assert.equal(result.thread.length, 0);
    assert.ok(result.gaps.length > 0);
    assert.ok(result.confidence === 0);
  });
});

describe('CausalThreadHydrator — excludes tool events when disabled', () => {
  it('keeps root but drops sibling tool-type nodes when includeToolEvents=false', async () => {
    const t0 = new Date('2026-06-27T05:00:00Z');
    const t1 = new Date('2026-06-27T05:01:00Z');
    const memories = [
      { id: 100001, content: 'Investigating the hydration gap', type: 'conversation', session_id: 'ses-t', project_id: null, created_at: t0 },
      { id: 100002, content: 'Running command to run tests', type: 'tool', session_id: 'ses-t', project_id: null, created_at: t1 },
    ];
    const pool = mkPool((sql: string, params?: unknown[]) => {
      if (sql.includes('FROM memories WHERE id = $1') && !sql.includes('memory_links') && !sql.includes('ABS')) {
        const id = params?.[0] as number;
        const mem = memories.find(m => m.id === id);
        return { rows: mem ? [mem] : [] };
      }
      if (sql.includes('ABS(EXTRACT')) {
        const rootId = params?.[1] as number;
        const lim = params?.[2] as number;
        const rootMem = memories.find(m => m.id === rootId);
        if (!rootMem) return { rows: [] };
        return { rows: memories.filter(m => m.id !== rootId && m.session_id === rootMem.session_id).slice(0, lim) };
      }
      return { rows: [] };
    });

    const hydrator = new CausalThreadHydrator(pool);
    const result = await hydrator.hydrateCausalThread({ memoryId: 100001, sessionId: 'ses-t', includeToolEvents: false });

    assert.ok(result.thread.some(n => n.memoryId === 100001), 'root kept');
    assert.ok(!result.thread.some(n => n.memoryId === 100002 && n.eventType === 'tool'), 'sibling tool node dropped');
  });
});