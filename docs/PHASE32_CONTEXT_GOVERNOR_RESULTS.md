# Phase 32 Context Governor Results

## Scope

This document packages the verified evidence for Phase 32 and its follow-on quota-savings pass.

It separates:
- synthetic long-session benchmark evidence
- captured trace benchmark evidence
- real workspace replay evidence

It also keeps reporting language explicit about review coverage:

`Independent tool-based review: tsc, tsc --noEmit, and Node test harness passed. No independent model/human code review was performed.`

## Best Claim

Technical claim:

> Phase 32 cut captured-session input spend by 63.9%, reduced peak active context by about 79.8%, and moved context pressure from turn 93 to turn 240 while preserving continuity.

Broader claim:

> Same task continuity, about 64% less token burn, about 80% less peak active context.

## Benchmark Summary

### 1. Synthetic Long-Session Benchmark

Command:

```powershell
npx tsx test/benchmark-context-governor.ts
```

Result:
- baseline input: `31,649,651`
- governor input: `14,720,227`
- savings: `53.5%`
- baseline active context: `117,392`
- governor active context: `31,147`
- pressure moved from turn `285` to turn `547`
- destructive rebuild continuity: preserved

### 2. Captured Trace Benchmark

Command:

```powershell
npx tsx test/benchmark-context-governor-trace.ts
```

Result:
- baseline input: `18,863,675`
- governor input: `6,813,396`
- savings: `63.9%`
- baseline peak active context: `156,532`
- governor peak active context: `31,687`
- tool-output share: `97.0%` to `53.2%`
- pressure moved from turn `93` to turn `240`
- continuity: preserved

### 3. Real Workspace Replay

Command:

```powershell
npx tsx test/benchmark-context-governor-trace.ts
```

Replay subsection result:
- workspace trace snapshots: `240`
- workspace trace tokens: `966,758`
- workspace trace peak: `8,110`
- replayed governor tokens: `857,170`
- replay reduction: `11.3%`

Why this matters:
- earlier replay evidence was `0.0%`
- current replay evidence shows the governor affects a real messy workspace trace, not only synthetic or generated captured traces

## Mechanisms Included

Phase 32 now includes:
- stale tool-output distillation
- duplicate-context deduplication
- repeated pattern collapse
- slope-based preemptive compaction
- retrieval-gated checkpoint ranking
- destructive rebuild continuity preservation
- benchmarked docs continuity

## Reproduction Commands

### Verification

```powershell
npx tsx --test test/context-governor.test.ts test/phase32-benchmark.test.ts test/phase32-trace-benchmark.test.ts test/phase32-docs-continuity.test.ts
npm.cmd run build
npm.cmd run typecheck
```

### Synthetic Benchmark

```powershell
npx tsx test/benchmark-context-governor.ts
```

### Captured Trace Benchmark

```powershell
npx tsx test/benchmark-context-governor-trace.ts
```

### Raw Prompt-Debug Trace Source

```text
.opencode/prompt-debug/messages-transform.jsonl
```

## Notes

- `docs/SYSTEM_MAP.md` already contained the Phase 32 trace entries before this packaging pass; this phase adds missing governor optimizer and test coverage references separately.
- Raw benchmark stdout is preserved in `docs/PHASE32_CONTEXT_GOVERNOR_RAW_OUTPUTS.md`.
