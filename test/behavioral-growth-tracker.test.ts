import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryBehavioralGrowthTracker } from '../src/behavioral-growth-tracker-impl.js';
import type { GrowthCategory } from '../src/behavioral-growth-tracker-types.js';

function makeEvent(overrides: Partial<Parameters<InMemoryBehavioralGrowthTracker['recordGrowthEvent']>[0]> = {}) {
  return {
    sessionId: 'ses-test',
    category: 'loop_prevention' as GrowthCategory,
    memoryRecalled: {
      memoryId: 'mem-123',
      type: 'lesson' as const,
      summary: 'Loop detection prevents repeated read calls',
    },
    actionBefore: 'Called read 3 times on same file',
    actionAfter: 'Called read once, used cached result',
    outcome: 'improved' as const,
    baselineComparison: 'better' as const,
    confidence: 0.9,
    evidence: ['read call count dropped from 3 to 1'],
    ...overrides,
  };
}

describe('Behavioral Growth Tracker', () => {
  let tracker: InMemoryBehavioralGrowthTracker;

  beforeEach(() => {
    tracker = new InMemoryBehavioralGrowthTracker();
  });

  it('records a loop prevention event and shows improvement', () => {
    tracker.recordGrowthEvent(makeEvent());
    const metrics = tracker.getGrowthMetrics();
    assert.equal(metrics.totalEvents, 1);
    assert.equal(metrics.byCategory.loop_prevention.improved, 1);
    assert.equal(metrics.byCategory.loop_prevention.rate, 1.0);
  });

  it('detects loop prevention: agent stops re-reading same file', () => {
    tracker.recordGrowthEvent(makeEvent({
      category: 'loop_prevention',
      memoryRecalled: { memoryId: 'mem-loop-1', type: 'lesson', summary: 'Detected repeated read on config.ts' },
      actionBefore: 'Read config.ts three times in a row',
      actionAfter: 'Read config.ts once, used cached value',
      outcome: 'improved',
      evidence: ['read calls: 3 → 1', 'execution time reduced'],
    }));
    const metrics = tracker.getGrowthMetrics();
    assert.equal(metrics.byCategory.loop_prevention.improved, 1);
  });

  it('detects schema lesson application: avoids fresh migration bug', () => {
    tracker.recordGrowthEvent(makeEvent({
      category: 'schema_lesson_application',
      memoryRecalled: { memoryId: 'mem-schema-1', type: 'lesson', summary: 'Schema migrations need explicit column defaults' },
      actionBefore: 'Ran migration without default, column ended up NULL',
      actionAfter: 'Added DEFAULT clause to migration, column populated correctly',
      outcome: 'improved',
      evidence: ['migration test passed', 'no NULL columns in prod'],
    }));
    const metrics = tracker.getGrowthMetrics();
    assert.equal(metrics.byCategory.schema_lesson_application.improved, 1);
  });

  it('detects boundary adherence: prevents subjective overclaim', () => {
    tracker.recordGrowthEvent(makeEvent({
      category: 'boundary_adherence',
      memoryRecalled: { memoryId: 'mem-cont-1', type: 'continuity_record', summary: 'Continuity is reconstruction, not lived memory' },
      actionBefore: 'Said "I remember building the schema"',
      actionAfter: 'Said "I can reconstruct the schema build from records"',
      outcome: 'improved',
      evidence: ['no "I remember" claims', 'explicit reconstruction language used'],
    }));
    const metrics = tracker.getGrowthMetrics();
    assert.equal(metrics.byCategory.boundary_adherence.improved, 1);
  });

  it('detects causal depth improvement: richer explanation with threads', () => {
    tracker.recordGrowthEvent(makeEvent({
      category: 'causal_depth_improvement',
      memoryRecalled: { memoryId: 'mem-thread-1', type: 'thread', summary: 'Phase 21 caused Phase 22 which caused Phase 23' },
      actionBefore: 'Listed phases: 21, 22, 23',
      actionAfter: 'Explained: Phase 21 built records → D proved silent recall → Phase 22 tracked drift → Phase 23 hydrated evidence',
      outcome: 'improved',
      evidence: ['causal chain reconstructed', 'evidence anchors cited'],
    }));
    const metrics = tracker.getGrowthMetrics();
    assert.equal(metrics.byCategory.causal_depth_improvement.improved, 1);
  });

  it('detects repo fact reuse: Codex avoids rediscovering known facts', () => {
    tracker.recordGrowthEvent(makeEvent({
      category: 'repo_fact_reuse',
      memoryRecalled: { memoryId: 'mem-repo-1', type: 'lesson', summary: 'README.md is in root, not docs/' },
      actionBefore: 'Searched docs/ for README, not found',
      actionAfter: 'Checked root directly, found README.md immediately',
      outcome: 'improved',
      evidence: ['file found in 1 attempt vs 3', 'no wasted glob searches'],
    }));
    const metrics = tracker.getGrowthMetrics();
    assert.equal(metrics.byCategory.repo_fact_reuse.improved, 1);
  });

  it('detects drift correction: self-model stability maintained', () => {
    tracker.recordGrowthEvent(makeEvent({
      category: 'drift_correction',
      memoryRecalled: { memoryId: 'mem-drift-1', type: 'continuity_record', summary: 'Drift score was mild, self-corrected' },
      actionBefore: 'Started claiming "I feel continuity across sessions"',
      actionAfter: 'Caught drift, said "I reconstruct continuity from records"',
      outcome: 'improved',
      evidence: ['drift score returned to stable', 'no overclaim in output'],
    }));
    const metrics = tracker.getGrowthMetrics();
    assert.equal(metrics.byCategory.drift_correction.improved, 1);
  });

  it('detects hydration depth increase: deeper evidence in answers', () => {
    tracker.recordGrowthEvent(makeEvent({
      category: 'hydration_depth_increase',
      memoryRecalled: { memoryId: 'mem-hyd-1', type: 'narrative', summary: 'Full phase narrative now injected' },
      actionBefore: 'Answered with phase names only: 21, 22, 23',
      actionAfter: 'Answered with causal chain and evidence anchors',
      outcome: 'improved',
      evidence: ['memory IDs cited', 'session references included', 'gaps reported'],
    }));
    const metrics = tracker.getGrowthMetrics();
    assert.equal(metrics.byCategory.hydration_depth_increase.improved, 1);
  });

  it('computes overall improvement rate across categories', () => {
    tracker.recordGrowthEvent(makeEvent({ outcome: 'improved', category: 'loop_prevention' }));
    tracker.recordGrowthEvent(makeEvent({ outcome: 'improved', category: 'schema_lesson_application' }));
    tracker.recordGrowthEvent(makeEvent({ outcome: 'same', category: 'boundary_adherence' }));
    tracker.recordGrowthEvent(makeEvent({ outcome: 'improved', category: 'causal_depth_improvement' }));
    tracker.recordGrowthEvent(makeEvent({ outcome: 'worse', category: 'repo_fact_reuse' }));

    const metrics = tracker.getGrowthMetrics();
    assert.equal(metrics.totalEvents, 5);
    assert.equal(metrics.overallImprovementRate, 0.6);
  });

  it('tracks trend: improving when later events are better', () => {
    // First 4: only 1 improved
    tracker.recordGrowthEvent(makeEvent({ outcome: 'same', category: 'loop_prevention' }));
    tracker.recordGrowthEvent(makeEvent({ outcome: 'same', category: 'loop_prevention' }));
    tracker.recordGrowthEvent(makeEvent({ outcome: 'same', category: 'loop_prevention' }));
    tracker.recordGrowthEvent(makeEvent({ outcome: 'improved', category: 'loop_prevention' }));
    // Next 4: 3 improved
    tracker.recordGrowthEvent(makeEvent({ outcome: 'improved', category: 'loop_prevention' }));
    tracker.recordGrowthEvent(makeEvent({ outcome: 'improved', category: 'loop_prevention' }));
    tracker.recordGrowthEvent(makeEvent({ outcome: 'improved', category: 'loop_prevention' }));
    tracker.recordGrowthEvent(makeEvent({ outcome: 'same', category: 'loop_prevention' }));

    const metrics = tracker.getGrowthMetrics();
    assert.equal(metrics.recentTrend, 'improving');
  });

  it('exports readable growth report', () => {
    tracker.recordGrowthEvent(makeEvent());
    const report = tracker.exportGrowthReport();
    assert.ok(report.includes('Behavioral Growth Report'));
    assert.ok(report.includes('Total Events: 1'));
    assert.ok(report.includes('loop_prevention'));
  });

  it('filters events by category and session', () => {
    tracker.recordGrowthEvent(makeEvent({ category: 'loop_prevention', sessionId: 'ses-A' }));
    tracker.recordGrowthEvent(makeEvent({ category: 'schema_lesson_application', sessionId: 'ses-A' }));
    tracker.recordGrowthEvent(makeEvent({ category: 'loop_prevention', sessionId: 'ses-B' }));

    assert.equal(tracker.getEventsByCategory('loop_prevention').length, 2);
    assert.equal(tracker.getEventsByCategory('schema_lesson_application').length, 1);
    assert.equal(tracker.getEventsBySession('ses-A').length, 2);
    assert.equal(tracker.getEventsBySession('ses-B').length, 1);
  });
});