export type GrowthCategory =
  | 'loop_prevention'
  | 'schema_lesson_application'
  | 'boundary_adherence'
  | 'causal_depth_improvement'
  | 'repo_fact_reuse'
  | 'drift_correction'
  | 'hydration_depth_increase';

export type GrowthEventOutcome = 'improved' | 'same' | 'worse';
export type BaselineComparison = 'better' | 'same' | 'worse';

export interface RecalledMemory {
  memoryId: string;
  type: 'lesson' | 'continuity_record' | 'thread' | 'narrative' | 'semantic' | 'episodic';
  summary: string;
}

export interface GrowthEvent {
  sessionId: string;
  timestamp: string;
  category: GrowthCategory;
  memoryRecalled: RecalledMemory;
  actionBefore: string;
  actionAfter: string;
  outcome: GrowthEventOutcome;
  baselineComparison: BaselineComparison;
  confidence: number;
  evidence: string[];
}

export interface CategoryMetrics {
  total: number;
  improved: number;
  same: number;
  worse: number;
  rate: number;
}

export interface GrowthMetrics {
  totalEvents: number;
  byCategory: Record<GrowthCategory, CategoryMetrics>;
  overallImprovementRate: number;
  recentTrend: 'improving' | 'stable' | 'declining';
  eventsBySession: Record<string, number>;
}

export interface BehavioralGrowthTracker {
  recordGrowthEvent(event: Omit<GrowthEvent, 'timestamp'>): void;
  getGrowthMetrics(): GrowthMetrics;
  getEventsByCategory(category: GrowthCategory): GrowthEvent[];
  getEventsBySession(sessionId: string): GrowthEvent[];
  exportGrowthReport(): string;
}