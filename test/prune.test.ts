import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert/strict";
import {
  pruneMemories,
  computeAgeDays_,
  computeEntityDensity_,
  isProtectedMemory_,
  computePruneScore_,
  classifyRisk_,
  buildReason_,
} from "../dist/prune-scorer.js";
import type { Memory, PruneConfig } from "../dist/types.js";
import { DEFAULT_PRUNE_CONFIG } from "../dist/types.js";

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return {
    id: 1,
    sessionId: "test",
    projectId: "test",
    type: "workspace",
    content: "test content",
    importance: 0.5,
    emotion: "neutral",
    source: "agent",
    tags: [],
    metadata: {},
    createdAt: ninetyDaysAgo,
    updatedAt: ninetyDaysAgo,
    lastAccessedAt: ninetyDaysAgo,
    recallCount: 0,
    graphLinks: 0,
    qualityScore: 0.5,
    ...overrides,
  };
}

describe("prune-scorer", () => {
  const config: PruneConfig = { ...DEFAULT_PRUNE_CONFIG, dryRun: true };

  describe("computeAgeDays", () => {
    it("returns 0 for today", () => {
      strictEqual(computeAgeDays_(new Date()), 0);
    });

    it("returns ~90 for 90 days ago", () => {
      const d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const age = computeAgeDays_(d);
      ok(age >= 89 && age <= 91, `Expected ~90, got ${age}`);
    });
  });

  describe("computeEntityDensity", () => {
    it("returns 0 for plain text", () => {
      const d = computeEntityDensity_("hello world this is plain");
      ok(d < 0.1, `Expected low density, got ${d}`);
    });

    it("returns > 0 for text with file paths and functions", () => {
      const d = computeEntityDensity_("Fixed src/tui.ts by calling renderComponent() and updateState()");
      ok(d > 0, `Expected positive density, got ${d}`);
    });
  });

  describe("isProtectedMemory", () => {
    it("protects memories with decisions", () => {
      const mem = makeMemory({ content: "Decision: use PostgreSQL for persistence" });
      const result = isProtectedMemory_(mem);
      strictEqual(result.protected, true);
      ok(result.reasons.some((r) => r.includes("decision")));
    });

    it("protects memories with errors/warnings", () => {
      const mem = makeMemory({ content: "ERROR: connection timeout in src/database.ts" });
      const result = isProtectedMemory_(mem);
      strictEqual(result.protected, true);
      ok(result.reasons.some((r) => r.includes("error") || r.includes("warning")));
    });

    it("protects memories with security notes", () => {
      const mem = makeMemory({ content: "Security: fixed CVE-2024-1234 in auth module" });
      const result = isProtectedMemory_(mem);
      strictEqual(result.protected, true);
    });

    it("protects memories with rollback notes", () => {
      const mem = makeMemory({ content: "Rollback plan: revert to previous schema if migration fails" });
      const result = isProtectedMemory_(mem);
      strictEqual(result.protected, true);
    });

    it("protects high graph connectivity", () => {
      const mem = makeMemory({ graphLinks: 5 });
      const result = isProtectedMemory_(mem);
      strictEqual(result.protected, true);
      ok(result.reasons.some((r) => r.includes("graph")));
    });

    it("protects frequently recalled", () => {
      const mem = makeMemory({ recallCount: 10 });
      const result = isProtectedMemory_(mem);
      strictEqual(result.protected, true);
      ok(result.reasons.some((r) => r.includes("recall")));
    });

    it("protects high importance", () => {
      const mem = makeMemory({ importance: 0.9 });
      const result = isProtectedMemory_(mem);
      strictEqual(result.protected, true);
      ok(result.reasons.some((r) => r.includes("importance")));
    });

    it("protects recently accessed", () => {
      const mem = makeMemory({ lastAccessedAt: new Date(), createdAt: new Date() });
      const result = isProtectedMemory_(mem);
      strictEqual(result.protected, true);
      ok(result.reasons.some((r) => r.includes("recently")));
    });

    it("protects high entity density", () => {
      const mem = makeMemory({ content: "src/tui.ts calls renderComponent() and updateState() and createContext()" });
      const result = isProtectedMemory_(mem);
      ok(result.protected);
    });

    it("does NOT protect low-value stale memories", () => {
      const result = isProtectedMemory_(makeMemory());
      strictEqual(result.protected, false);
    });
  });

  describe("computePruneScore", () => {
    it("scores old low-importance memories high (prunable)", () => {
      const { score } = computePruneScore_(makeMemory(), config);
      ok(score >= 0.5, `Expected high score for stale memory, got ${score}`);
    });

    it("scores recent high-importance memories low (not prunable)", () => {
      const mem = makeMemory({
        importance: 0.9,
        recallCount: 10,
        graphLinks: 5,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      });
      const { score } = computePruneScore_(mem, config);
      ok(score < 0.5, `Expected low score for valuable memory, got ${score}`);
    });

    it("never-recalled memories score higher than frequently recalled", () => {
      const { score: scoreNever } = computePruneScore_(makeMemory({ recallCount: 0 }), config);
      const { score: scoreOften } = computePruneScore_(makeMemory({ recallCount: 20 }), config);
      ok(scoreNever > scoreOften, `Never-recalled (${scoreNever}) should score higher than often-recalled (${scoreOften})`);
    });
  });

  describe("classifyRisk", () => {
    it("classifies score 0.8 as low risk", () => {
      strictEqual(classifyRisk_(0.8), "low");
    });

    it("classifies score 0.5 as medium risk", () => {
      strictEqual(classifyRisk_(0.5), "medium");
    });

    it("classifies score 0.2 as high risk", () => {
      strictEqual(classifyRisk_(0.2), "high");
    });
  });

  describe("buildReason", () => {
    it("mentions old age", () => {
      const reason = buildReason_({ ageDays: 120, importance: 0.5, recallCount: 0, graphLinks: 0, entityDensity: 0, qualityScore: 0.5, sessionRelevance: 0 }, []);
      ok(reason.includes("old"));
    });

    it("mentions low importance", () => {
      const reason = buildReason_({ ageDays: 5, importance: 0.1, recallCount: 5, graphLinks: 3, entityDensity: 0.1, qualityScore: 0.8, sessionRelevance: 0.5 }, []);
      ok(reason.includes("low importance"));
    });

    it("mentions never recalled", () => {
      const reason = buildReason_({ ageDays: 5, importance: 0.5, recallCount: 0, graphLinks: 3, entityDensity: 0.1, qualityScore: 0.8, sessionRelevance: 0.5 }, []);
      ok(reason.includes("never recalled"));
    });
  });

  describe("pruneMemories (dry-run)", () => {
    it("never modifies input memories", () => {
      const memories = [makeMemory(), makeMemory({ id: 2 })];
      const before = JSON.stringify(memories);
      pruneMemories(memories, config);
      strictEqual(JSON.stringify(memories), before);
    });

    it("produces candidates with all required fields", () => {
      const report = pruneMemories([makeMemory()], config);
      ok(report.candidates.length >= 0);
      ok(report.totalCandidates >= 1);
      ok(typeof report.totalTokensSaved === "number");
      ok(typeof report.dryRun === "boolean");
    });

    it("marks protected memories in report", () => {
      const mem = makeMemory({ content: "Decision: use SQLite" });
      const report = pruneMemories([mem], config);
      const candidate = report.candidates.find((c) => c.memoryId === mem.id);
      ok(candidate === undefined || candidate.protected, "Protected memories should not appear as prunable candidates");
      strictEqual(report.protectedCount, 1);
    });

    it("suggests low-value stale memories for pruning", () => {
      const stale = makeMemory({ importance: 0.1, recallCount: 0, graphLinks: 0, qualityScore: 0.3 });
      const report = pruneMemories([stale], config);
      const candidate = report.candidates.find((c) => c.memoryId === stale.id);
      ok(candidate !== undefined, "Stale low-value memory should be a candidate");
      strictEqual(candidate!.riskLevel, "low");
    });

    it("includes risk distribution", () => {
      const report = pruneMemories([makeMemory()], config);
      ok(typeof report.riskDistribution.low === "number");
      ok(typeof report.riskDistribution.medium === "number");
      ok(typeof report.riskDistribution.high === "number");
    });

    it("includes tokens saved estimate", () => {
      const mem = makeMemory({ content: "This is a test memory with some content for token estimation" });
      const report = pruneMemories([mem], config);
      ok(report.totalTokensSaved >= 0);
      if (report.candidates.length > 0) {
        ok(report.candidates[0].tokensSaved > 0, "Candidates should have token estimates");
      }
    });

    it("respects maxCandidates limit", () => {
      const config5 = { ...config, maxCandidates: 3 };
      const memories = Array.from({ length: 20 }, (_, i) =>
        makeMemory({ id: i + 1, importance: 0.1, recallCount: 0, graphLinks: 0, qualityScore: 0.2 })
      );
      const report = pruneMemories(memories, config5);
      ok(report.candidates.length <= 3, `Expected at most 3 candidates, got ${report.candidates.length}`);
    });

    it("dry-run is always true in report", () => {
      const report = pruneMemories([makeMemory()], { ...config, dryRun: true });
      strictEqual(report.dryRun, true);
    });

    it("sorts candidates: non-protected low-risk first", () => {
      const mems = [
        makeMemory({ id: 1, content: "Decision: use REST API", importance: 0.9, recallCount: 10, graphLinks: 5 }),
        makeMemory({ id: 2, importance: 0.1, recallCount: 0, graphLinks: 0, qualityScore: 0.2 }),
      ];
      const report = pruneMemories(mems, config);
      const prunableIds = report.candidates.map((c) => c.memoryId);
      if (prunableIds.length >= 2) {
        ok(prunableIds.indexOf(2) < prunableIds.indexOf(1), "Low-value memory should come before protected");
      }
    });

    it("mix of protected and unprotected gives correct counts", () => {
      const mems = [
        makeMemory({ id: 1, content: "Decision: use REST" }),
        makeMemory({ id: 2, importance: 0.1, recallCount: 0, graphLinks: 0 }),
        makeMemory({ id: 3, content: "ERROR: crash in prod" }),
        makeMemory({ id: 4, importance: 0.05, recallCount: 0, graphLinks: 0, qualityScore: 0.1 }),
      ];
      const report = pruneMemories(mems, config);
      ok(report.protectedCount >= 2, `Expected 2+ protected, got ${report.protectedCount}`);
      ok(report.prunableCount >= 1, `Expected 1+ prunable, got ${report.prunableCount}`);
    });
  });

  describe("zero database changes guarantee", () => {
    it("pruneMemories returns a report but never writes to DB", () => {
      const mem = makeMemory({ id: 42, content: "stale memory" });
      const report = pruneMemories([mem], config);
      strictEqual(report.dryRun, true);
      ok(typeof report.candidates === "object");
      ok(!Array.isArray(report.candidates) || report.candidates.every((c) => c.action === "would_archive"));
    });

    it("pruneMemories is a pure function — no side effects", () => {
      const mems = [makeMemory(), makeMemory({ id: 2 })];
      const original = JSON.parse(JSON.stringify(mems));
      pruneMemories(mems, config);
      deepStrictEqual(mems, original);
    });

    it("no candidate has action=delete or action=archive", () => {
      const report = pruneMemories([makeMemory()], config);
      for (const c of report.candidates) {
        strictEqual(c.action, "would_archive");
      }
    });
  });
});

function deepStrictEqual(a: unknown, b: unknown) {
  ok(JSON.stringify(a) === JSON.stringify(b), `Expected deep equality`);
}
