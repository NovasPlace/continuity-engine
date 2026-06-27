# Phase 32 Context Governor Raw Outputs

These are the raw benchmark and verification outputs referenced by the Phase 32 evidence package.

## Synthetic Long-Session Benchmark

Command:

```powershell
npx tsx test/benchmark-context-governor.ts
```

Output:

```text
baseline_input=31649651
governor_input=14720227
baseline_active=117392
governor_active=31147
governor_saved_pct=53.5
governor_action=light_memory_brief
baseline_pressure_turn=285
governor_pressure_turn=547
baseline_repeated_work=0
governor_repeated_work=0
baseline_forgotten_decisions=0
governor_forgotten_decisions=0
destructive_rebuild_continuity=true
destructive_rebuild_result=failing error preserved
continuity_state=[MEMORY_BRIEF] Working turn 179. Keep the governor under budget. | read test/context-governor.test.ts xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Captured Trace Benchmark

Command:

```powershell
npx tsx test/benchmark-context-governor-trace.ts
```

Output:

```text
captured_baseline_tokens=18863675
captured_governor_tokens=6813396
captured_peak_baseline=156532
captured_peak_governor=31687
captured_pressure_turn_baseline=93
captured_pressure_turn_governor=240
captured_tool_share_baseline=0.970
captured_tool_share_governor=0.532
captured_reduction_pct=63.9
captured_continuity=true
captured_build_state=failing error preserved
workspace_trace_snapshots=240
workspace_trace_tokens=966758
workspace_trace_peak=8110
workspace_trace_pressure_turn=240
workspace_replay_governor_tokens=857170
workspace_replay_reduction_pct=11.3
```

## Verification

Command:

```powershell
npx tsx --test test/context-governor.test.ts test/phase32-benchmark.test.ts test/phase32-trace-benchmark.test.ts test/phase32-docs-continuity.test.ts
```

Output:

```text
▶ AdaptiveContextGovernor
  ✔ leaves low-pressure sessions alone (1.04ms)
  ✔ compacts old tool calls when projected size crosses the 50k threshold (1181.4428ms)
  ✔ adds a light memory brief before higher thresholds (562.3053ms)
  ✔ replaces older history with checkpoint refs at the 60k threshold (81.0857ms)
  ✔ falls back to distilled project state before emergency rebuild (28.5202ms)
  ✔ keeps goal, phase, files, failing test, and next step during emergency rebuild (2.528ms)
  ✔ reports profile budgets and monitor metrics needed for context pressure decisions (0.2659ms)
  ✔ distills stale tool output and deduplicates repeated old context (5.4455ms)
  ✔ collapses repeated stale tool signatures into tiny refs (0.2641ms)
✔ AdaptiveContextGovernor (1863.9015ms)
▶ Phase 32 benchmark harness
  ✔ shows the governor reducing active context versus baseline (554.5138ms)
  ✔ preserves continuity after destructive rebuild (551.5572ms)
  ✔ keeps repeated work risk below baseline (401.9526ms)
✔ Phase 32 benchmark harness (1508.9075ms)
✔ Phase 32 files remain auto-documentable after compaction work (451.1798ms)
✔ captured trace benchmark shows governor token reduction under pressure (1162.191ms)
ℹ tests 14
ℹ suites 2
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2026.0649
```

Command:

```powershell
npm.cmd run build
npm.cmd run typecheck
```

Output:

```text
> opencode-cross-session-memory@1.0.0 build
> tsc
```

```text
> opencode-cross-session-memory@1.0.0 typecheck
> tsc --noEmit
```
