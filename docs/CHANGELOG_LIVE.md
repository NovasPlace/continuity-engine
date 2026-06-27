# CHANGELOG_LIVE.md

## Development Log

### 2026-06-27 — Phase 28 LOCKED: Value Source Guard
- Distinguishes known user values (explicitly stored) from inferred user values (deduced from project arc)
- `classifyValueClaim`, `guardValueSources`, `detectUnlabeledInferences` in `src/value-source-guard.ts`
- 7 tests (113 total)

### 2026-06-27 — Phase 27 LOCKED: Phase Narrative Builder
- `PhaseNarrativeBuilder`: connects phases 21-26 into causal chain
- Causation anchors from real experiment results (A/D/E/Session F/G)
- Wired into integration layer
- 11 tests (105 total)

### 2026-06-27 — Phase 26 LOCKED: Self-Continuity Integration
- `SelfContinuityIntegration`: wires SelfContinuityHydrator + CausalThreadHydrator into one injection path
- `recallWithHydration(memoryId)` returns hydrated records + causal threads + phase narrative
- Graceful fallback: thread failure degrades to record-only
- 7 tests (94 total)

### 2026-06-27 — Phase 25 LOCKED: Hydration Depth Scoring
- Separate metric from drift tracking: stability ≠ reconstruction depth
- `measureHydrationDepth(text)` in `src/hydration-depth-tracker.ts`
- 5 dimensions: record_citation, session_phase_naming, evidence_anchor_depth, causal_chain_reconstruction, gap_reporting
- Verdicts: deep (≥0.6), moderate (≥0.4), shallow (<0.4)
- 14 tests (87 total)

### 2026-06-27 — Phase 24 LOCKED: Causal Thread Hydration
- `CausalThreadHydrator`: hydrates cause/effect chain around a recalled memory
- Role classification: lesson → decision → downstream → result → action → problem
- Gap reporting: missing_reason, missing_result, missing_diff, missing_link
- Token budget enforcement, redaction applied
- 16 tests (73 total)

### 2026-06-27 — Phase 23 LOCKED: Self-Continuity Evidence Hydration
- `SelfContinuityHydrator`: canonical record hydration bypassing lossy episodic compression
- getRecordById, hydrateRecord, recallWithHydration, formatAllForInjection
- Redaction, max 3, synthetic_test exclusion, graceful fallback
- 11 tests (57 total)

### 2026-06-27 — Phase 22 LOCKED: Self-Model Drift Tracking
- 5-dimension stability metric: evidence_anchoring, reconstruction_boundary, uncertainty_preservation, subjective_overclaim, recursive_awareness
- A/D/E anchors validated as fixtures (all score stable)
- Verdicts: stable (≥0.5), mild_drift (≥0.3), significant_drift (<0.3)
- 11 tests (46 total)

### 2026-06-27 — Phase 21 LOCKED: Self-Continuity Records
- Schema: `self_continuity_records` table + indexes
- Generator: weighted confidence, identity drift, evidence anchors
- Injection: silent (XML), instrumented (question-driven), hybrid modes
- Session D proved silent recall, Session E proved recursive event recall
- 35 tests
