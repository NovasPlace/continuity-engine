# CHANGELOG_LIVE.md

## Development Log

### 2026-06-27 — Phase 30 LOCKED: Behavioral Growth Tracking
- `InMemoryBehavioralGrowthTracker`: records growth events across 7 categories
- Categories: loop_prevention, schema_lesson_application, boundary_adherence, causal_depth_improvement, repo_fact_reuse, drift_correction, hydration_depth_improvement
- Metrics: event count, category breakdown, baseline comparison, overall growth score
- 12 tests passing (133 total across all suites)

### 2026-06-27 — Phase 29 LOCKED: Response Mode Selector
- `selectResponseMode`: auto-selects 'basic' or 'deep' based on available context
- Basic mode: documentary boundary only
- Deep mode: boundary + evidence + causal chain + narrative arc
- 8 tests passing

### 2026-06-27 — Phase 28 LOCKED: Value Source Guard
- Distinguishes known user values (explicitly stored) from inferred user values (deduced from project arc)
- `classifyValueClaim`, `guardValueSources`, `detectUnlabeledInferences`
- 7 tests passing

### 2026-06-27 — Phase 27 LOCKED: Phase Narrative Builder
- `PhaseNarrativeBuilder`: connects phases 21-26 into causal chain (problem → action → result → downstream change)
- Causation anchors from real A/D/E/21-26 progression
- 11 tests passing

### 2026-06-27 — Phase 26 LOCKED: Self-Continuity Integration
- `SelfContinuityIntegration`: wires SelfContinuityHydrator + CausalThreadHydrator into one injection path
- Recall returns canonical fields + causal threads
- Failure degrades gracefully
- 7 tests passing

### 2026-06-27 — Phase 25 LOCKED: Hydration Depth Scoring
- Separate metric from drift tracking: stability ≠ reconstruction depth
- `measureHydrationDepth`: 5 dimensions (record_citation, session_phase_naming, evidence_anchor_depth, causal_chain_reconstruction, gap_reporting)
- 14 tests passing

### 2026-06-27 — Phase 24 LOCKED: Causal Thread Hydration
- `CausalThreadHydrator`: reconstructs causal thread around a recalled memory (problem → action → result → decision → lesson → downstream_change)
- Distinguishes temporal adjacency from causal links
- Reports gaps instead of hallucinating
- 16 tests passing

### 2026-06-27 — Phase 23 LOCKED: Self-Continuity Evidence Hydration
- `SelfContinuityHydrator`: canonical record hydration bypassing lossy episodic compression
- `getRecordById`, `hydrateRecord`, `recallWithHydration`, `formatForInjection`
- Max 3, synthetic_test excluded, redaction applied, fallback to summary
- 11 tests passing

### 2026-06-27 — Phase 22 LOCKED: Self-Model Drift Tracking
- 5-dimension stability metric: evidence_anchoring, reconstruction_boundary, uncertainty_preservation, subjective_overclaim, recursive_awareness
- A/D/E anchors as fixtures
- 11 tests passing

### 2026-06-27 — Phase 21 LOCKED: Self-Continuity Records
- Schema: self_continuity_records table + indexes
- Generator: weighted confidence, identity drift, evidence anchors
- Injection: silent/instrumented modes, redaction, synthetic_test exclusion
- 35 tests passing