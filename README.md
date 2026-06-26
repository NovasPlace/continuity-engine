# Cross-Session Memory Plugin

A full-stack memory and context management system for AI coding assistants. Persists knowledge across sessions, compacts context on the fly, checkpoints progress, and auto-documents your codebase — all backed by PostgreSQL + pgvector.

## What It Does

This plugin gives an AI assistant **long-term memory**. Without it, every new session starts from zero. With it, the assistant remembers what it did last session, what decisions were made, what went wrong, what the codebase looks like, and where it left off.

### Memory System
- **Cross-session persistence** — Memories are stored in PostgreSQL and survive session restarts. Every session can recall, search, and build on knowledge from prior sessions.
- **Automatic memory extraction** — After every assistant turn, raw conversation text is distilled into structured semantic memories (decisions, lessons, workspace state, repo context) without any user effort.
- **Memory types** — `conversation`, `workspace`, `repo`, `preference`, `lesson`. Each type gets its own importance weighting and search behavior.
- **Hybrid search** — Queries are resolved using **Reciprocal Rank Fusion (RRF)** combining vector similarity (pgvector/Ollama embeddings, weight 0.35), full-text search (PostgreSQL `tsvector`, weight 0.25), and entity matching (weight 0.35) with exact-match boosting. This beats vector-only search on exact names, error codes, and identifiers.
- **Concept extraction & knowledge graph** — Concepts are automatically extracted from memory content and linked together. The graph enables entity-density scoring and related-memory traversal.
- **Prune scoring** — Multi-signal prune scoring (age, importance, access recency, entity density, type priority) with protection rules for recent/important memories. Dry-run only — never deletes without explicit approval.

### Context Pipeline
- **Context compilation** — On every API call, the context compiler builds a manifest of what to include: pinned items, active goals, recent tool activity, episodic events, procedural lessons, and semantic project context. Items are classified (pinned/compressible/non-compressible/short_tool_output) and compressed or kept based on the current token budget.
- **Short tool output compaction** — Even sub-100-token tool outputs are now compressible when they fall outside the recent window. Previously, hundreds of small tool calls could pile up unfixed in context because they were individually "too small to bother." Now they get summarized too, recapturing budget.
- **Tool-call distillation** — Completed tool calls are distilled into structured summaries: intent, files changed, errors, and fixes. Raw output is replaced with a `[COMPACTED]` reference.
- **Assistant text compaction** — Long assistant responses are compressed to key lines with truncation markers, preserving the signal without the prose.
- **Compaction quality gate** — Every compaction is scored: `entity_retention * 0.35 + decision_retention * 0.25 + error_retention * 0.25 + similarity * 0.15`. Compactions scoring below 0.6 are rejected — the original content is kept intact rather than losing critical information.
- **Context pressure tracking** — Token budgets are tracked per-mode (`normal`, `deep`, `minimal`) with soft/hard limits. The system fails closed if prompt exceeds the hard limit.

### Checkpoint System
- **Session checkpoints** — Snapshots the entire session state (goal, decisions, active files, errors, constraints, pending plan) into a structured, recoverable checkpoint stored in PostgreSQL.
- **Context rollover** — When context fills up, the system generates a **rollover brief**: a compressed handoff document summarizing what was happening, what's active, and what to continue. The next session picks up where the last one left off.
- **Auto-checkpoint on risky edits** — Before destructive file operations, an automatic checkpoint is queued so you can roll back.
- **Checkpoint → Markdown** — Checkpoints render to readable Markdown for review and debugging.

### Auto-Documentation
- **File-edit hooks** — On every file edit (create, modify, delete), the `auto-docs` hook queues an update to `docs/SYSTEM_MAP.md`.
- **Dedup & stub filtering** — Duplicate entries are merged, stub/test files are filtered out, and the document stays clean and current.
- **Session-end flush** — All pending doc updates are flushed at session end so the map is always up-to-date.

### Safety & Monitoring
- **Loop detector** — Detects when the assistant is calling the same tool with the same arguments repeatedly (3+ identical calls) and breaks the loop.
- **Git watcher** — Monitors git changes and surfaces diffs to the context pipeline.
- **Subconscious background maintenance** — Runs periodic housekeeping: memory cleanup, concept graph updates, compaction telemetry.
- **Token bucket analysis** — Forecasts when the context window will fill up based on current usage rate.
- **Context priming** — On session start, relevant memories are pre-loaded so the assistant has context before the first user message.

### Goals System
- **Persistent goals** — Goals survive across sessions. Set a goal, work on it, mark it achieved or abandoned. The active goal is always visible in the system prompt.
- **Goal tracking** — Goals have status (`active`, `achieved`, `abandoned`), context metadata, and can be linked to memories.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Plugin Entry                       │
│                   src/index.ts                        │
│              (registers hooks + tools)                │
├──────────┬──────────┬───────────┬─────────────────────┤
│  Memory  │ Context  │Checkpoint  │     Hooks          │
│ System   │ Pipeline │  System   │                     │
├──────────┼──────────┼───────────┼─────────────────────┤
│Manager   │Compiler  │Builder    │ auto-docs           │
│Graph     │Compactor │Capture    │ doc-analyzer        │
│Extractor │Pressure  │Store      │ tool-execute        │
│Concepts  │Rollover  │Inject     │ session-compaction  │
│Search    │Recall    │Markdown   │ system-transform    │
│Prune     │Cache     │Telemetry  │                     │
├──────────┴──────────┴───────────┴─────────────────────┤
│                  PostgreSQL + pgvector                 │
│                  Ollama (embeddings)                   │
└──────────────────────────────────────────────────────┘
```

## Key Design Decisions

- **No CLI** — This is a runtime/API-first plugin. The TUI (`src/tui.ts`) is an optional Solid-PRG adapter with graceful fallback if unavailable.
- **PostgreSQL + pgvector only** — No SQLite, Redis, or ORM. All persistence, vector search, and full-text search go through PostgreSQL.
- **Ollama for embeddings** — Local embedding generation. No external API calls, no API keys, no cloud dependency.
- **RRF hybrid search** — Combines vector similarity, full-text search, and entity matching. Weights: vector 0.35, text 0.25, entity 0.35 with exact-match boosting. Benchmarked to outperform vector-only on 5/5 test queries including exact name matches and error code lookups.
- **Compaction quality gate** — Score formula: `entity_retention × 0.35 + decision_retention × 0.25 + error_retention × 0.25 + similarity × 0.15`. Reject threshold: 0.6. Rejected compactions keep the original content intact.
- **Fail-closed on token overflow** — If the prompt exceeds the hard token limit, the system rejects it rather than silently truncating and losing context.

## Test Suite

190 tests across 15+ suites covering every subsystem:

| Suite | Tests | What It Covers |
|-------|-------|----------------|
| `context-compiler` | 8+ | Classification, compression, budget modes, short output compaction |
| `compaction` | 30+ | Quality scoring, entity/decision/error retention, drift detection |
| `compaction-quality` | 15+ | Quality metrics, rejection thresholds |
| `auto-docs` | 29 | Doc queue, flush, dedup, stub filtering, path ignoring |
| `hybrid-search` | 15+ | RRF fusion, vector/text/entity weights, exact-match boost |
| `prune` | 20+ | Age/importance/access scoring, protection rules, dry-run |
| `checkpoint` | 10+ | Capture, store, restore, markdown rendering |
| `goal` | 10+ | CRUD, status transitions, metadata |

Run everything:
```bash
npm run build && npx tsx --test 'test/*.test.ts'
```

## Setup

```bash
npm install
npm run build
```

Requires a running PostgreSQL instance with pgvector extension and Ollama for local embeddings.
