export type GrowthCategory =
  | 'loop_prevention'
  | 'schema_lesson_application'
  | 'boundary_adherence'
  | 'causal_depth_improvement'
  | 'repo_fact_reuse'
  | 'drift_correction'
  | 'hydration_depth_increase';

export type GrowthEventOutcome = 'improved' | 'same' | 'worse' | 'unknown';

export interface GrowthEvent {
  id: string;
  timestamp: string;
  sessionId: string;
  category: GrowthCategory;
  memoryRecalled: {
    memoryId: string;
    type: 'lesson' | 'continuity_record' | 'thread' | 'narrative' | 'phase_narrative';
    summary: string;
  };
  actionBefore: string;
  actionAfter: string;
  outcome: GrowthEventOutcome;
  baselineComparison: 'better' | 'same' | 'worse' | 'no_baseline';
  confidence: number;
  evidence: string[];
}

export interface GrowthMetrics {
  totalEvents: number;
  byCategory: Record<GrowthCategory, { count: number; improved: number; rate: number }>;
  overallImprovementRate: number;
  cumulativeGrowthScore: number;
  recentTrend: 'improving' | 'stable' | 'declining';
}

export interface BehavioralGrowthTracker {
  recordGrowthEvent(event: Omit<GrowthEvent, 'id' | 'timestamp'>): GrowthEvent;
  getGrowthMetrics(): GrowthMetrics;
  getEventsByCategory(category: GrowthCategory): GrowthEvent[];
  getEventsBySession(sessionId: string): GrowthEvent[];
  exportGrowthReport(): string;
}