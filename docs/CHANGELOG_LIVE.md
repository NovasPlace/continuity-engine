# CHANGELOG_LIVE.md

## Development Log

### 2026-06-26 — Phase 13: Memory Prune (Dry-Run)
- New `src/prune-scorer.ts`: multi-signal prune scoring + protection rules
- Scoring: age + importance + recall + graph + entity density + session relevance
- Protection: decisions, errors/warnings, security, rollback, code entities, high connectivity
- Dry-run only — zero database writes
- Risk levels: low/medium/high
- 36 new tests, 15 suites total, 153 tests passing

### 2026-06-26 — Phase 12: Auto-Docs Fixed
- Fixed SYSTEM_MAP.md spam (was 530 lines of stubs, now clean)
- Dedup logic now matches table rows (`backtick`) AND bold entries
- Stub filtering: skip files with zero exports AND zero imports
- Windows path fix: forward-slash comparison instead of `normalize()` + `sep`
- `test/fixtures/` added to ignored paths
- 9 new tests (29/29 pass in auto-docs suite)

### 2026-06-26 — Phase 11: Compaction Quality Metrics
- New `src/compaction-quality.ts` with 10 quality metrics
- `extractEntities`: file paths, camelCase, PascalCase, config keys, error classes
- `extractDecisions`: decision verbs + rationale patterns
- `extractWarningsErrors`: ERROR/WARNING/deprecated/rollback patterns
- `computeRetention`: fuzzy case-insensitive matching
- `quality_score` = entity_retention×0.35 + decision_retention×0.25 + error_retention×0.25 + similarity×0.15
- Threshold: reject compaction if quality < 0.6, warn if < 0.7
- 34 new tests

### 2026-06-26 — Phase 10: Benchmark Report
- Hybrid search vs vector-only comparison: 5/5 queries won by hybrid
- Exact code queries: rank #1 (score 0.71) vs rank 2-8 (score 0.015)
- Semantic queries: same rank as vector (no regression)
- Entity boost creates ~47x score advantage for exact matches

### 2026-06-26 — Phase 9: Hybrid Search Fix
- Fixed `$2` parameter conflict in entityMatchBoost SQL (was used for LIMIT and JSONB)
- Added metadata conditions to WHERE clause (entity boost was partly fake before)
- Added sessions table creation to database.ts initializeSchema
- Added `directory`/`title` columns, `embedding`/`search_vector` columns
- Added `close()` method to Database class
- Expanded CHECK constraints: memory_type (+concept, code, config, error), emotion (+frustrated)
- Weights: vector=0.35, text=0.25, entity=0.35
- 7 new tests

### 2026-06-26 — Phase 8: Concept Extraction + Memory Graph
- New `src/concept-extractor.ts`: LLM-based concept extraction
- New `src/memory-graph.ts`: concept graph storage + traversal
- New `src/memory-extractor.ts`: raw text → semantic memory extraction
- Enhanced `memory_list` with sort by importance/accessed/recent
- 12 new tests

### 2026-06-25 — Phase 7: Hybrid Search
- RRF-based hybrid search: vector + full-text + entity match boost
- `src/hybrid-search.ts` with reciprocal rank fusion
- Entity boost: content ILIKE (2.0), tags (1.5), concepts (1.8)
- 7 new tests

### 2026-06-25 — Phase 6: Context Cache
- Write-through context cache with manifest + LRU eviction
- Runtime read-through cache layer
- Context review tool + compaction trigger
- 11 new tests

### 2026-06-25 — Phase 5: Checkpoint System
- Full checkpoint capture/restore/inject pipeline
- PostgreSQL persistence + Markdown rendering
- Auto-checkpoint on risky edits
- Telemetry tracking

### 2026-06-25 — Phase 4: Context Rollover
- Session rollover with brief handoff
- Rollover schema + brief generation
- Configuration system

### 2026-06-25 — Phase 3: Auto-Docs Noise Guard
- Dedup, grouping, ignored paths (docs/, dist/, node_modules/, coverage/, .git/)
- Max entry length, config toggle
- Stub file filtering

### 2026-06-24 — Phase 2: Auto-Documentation Hooks
- auto-docs.ts queues updates on file edits
- doc-analyzer.ts: file change → doc section update
- Flushes on session end via tool-execute.after hook

### 2026-06-24 — Phase 1: Cross-Session Memory Plugin
- PostgreSQL memory store (memories, sessions, checkpoints)
- Context cache, distilled summaries
- Plugin registration + hook system
