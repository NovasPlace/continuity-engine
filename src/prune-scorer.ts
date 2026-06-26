import type {
  Memory,
  PruneCandidate,
  PruneConfig,
  PruneReport,
  PruneRiskLevel,
  PruneSignal,
} from "./types.js";
import { DEFAULT_PRUNE_CONFIG } from "./types.js";
import { extractEntities, extractDecisions, extractWarningsErrors } from "./compaction-quality.js";

const PROTECTED_PATTERNS = [
  /\b(security|CVE|vulnerability|exploit)\b/i,
  /\b(rollback|revert|regression)\b/i,
];

function computeAgeDays(createdAt: Date): number {
  const now = Date.now();
  const created = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  return Math.max(0, (now - created) / (1000 * 60 * 60 * 24));
}

function computeEntityDensity(content: string): number {
  const entities = extractEntities(content);
  return entities.length / Math.max(1, content.split(/\s+/).length);
}

function isProtectedMemory(memory: Memory): { protected: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const content = memory.content || "";

  if (extractDecisions(content).length > 0) {
    reasons.push("contains decisions");
  }

  const warningsErrors = extractWarningsErrors(content);
  if (warningsErrors.length > 0) {
    reasons.push("contains errors/warnings");
  }

  for (const pattern of PROTECTED_PATTERNS) {
    if (pattern.test(content)) {
      const match = pattern.source.replace(/\\b/g, "").replace(/\\/g, "");
      reasons.push(`contains protected pattern: ${match}`);
    }
  }

  const entities = extractEntities(content);
  if (entities.length >= 3) {
    reasons.push("high entity density (file/function/config references)");
  }

  if ((memory.graphLinks ?? 0) >= 3) {
    reasons.push(`high graph connectivity (${memory.graphLinks} links)`);
  }

  if ((memory.recallCount ?? 0) >= 3) {
    reasons.push(`frequently recalled (${memory.recallCount} times)`);
  }

  if ((memory.importance ?? 0) >= 0.7) {
    reasons.push(`high importance (${memory.importance})`);
  }

  const ageDays = computeAgeDays(memory.createdAt);
  if ((memory.lastAccessedAt || memory.createdAt) && computeAgeDays(memory.lastAccessedAt || memory.createdAt) < 7) {
    reasons.push("recently accessed");
  }

  return { protected: reasons.length > 0, reasons };
}

function computePruneScore(
  memory: Memory,
  config: PruneConfig,
): { score: number; signals: PruneSignal } {
  const ageDays = computeAgeDays(memory.createdAt);
  const importance = memory.importance ?? 0.5;
  const recallCount = memory.recallCount ?? 0;
  const graphLinks = memory.graphLinks ?? 0;
  const entityDensity = computeEntityDensity(memory.content || "");
  const qualityScore = memory.qualityScore ?? 0.7;

  const sessionRelevance = memory.sessionId ? 0.5 : 0;

  const ageScore = Math.min(1, ageDays / config.maxAgeDays);
  const lowImportance = 1 - importance;
  const lowRecall = 1 - Math.min(1, recallCount / config.minRecallCountForProtection);
  const lowGraph = 1 - Math.min(1, graphLinks / config.minGraphLinksForProtection);
  const lowEntity = 1 - Math.min(1, entityDensity / 0.3);
  const lowSession = 1 - sessionRelevance;
  const lowQuality = 1 - qualityScore;

  const score =
    ageScore * 0.2 +
    lowImportance * 0.25 +
    lowRecall * 0.2 +
    lowGraph * 0.15 +
    lowEntity * 0.05 +
    lowSession * 0.05 +
    lowQuality * 0.1;

  const signals: PruneSignal = {
    ageDays,
    importance,
    recallCount,
    graphLinks,
    entityDensity,
    qualityScore,
    sessionRelevance,
  };

  return { score, signals };
}

function classifyRisk(score: number): PruneRiskLevel {
  if (score >= 0.7) return "low";
  if (score >= 0.4) return "medium";
  return "high";
}

function reasonForPrune(
  score: number,
  signals: PruneSignal,
  protectionReasons: string[],
): string {
  const parts: string[] = [];

  if (signals.ageDays > 30) parts.push(`old (${Math.round(signals.ageDays)}d)`);
  if (signals.importance < 0.3) parts.push("low importance");
  if (signals.recallCount === 0) parts.push("never recalled");
  if (signals.graphLinks <= 1) parts.push("weak graph links");
  if (signals.entityDensity < 0.05) parts.push("low entity density");
  if (signals.qualityScore < 0.6) parts.push("low quality score");
  if (protectionReasons.length > 0) parts.push(`protected: ${protectionReasons.join(", ")}`);

  if (parts.length === 0) parts.push("marginal candidate");

  return parts.join("; ");
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

export function pruneMemories(
  memories: Memory[],
  config: PruneConfig = DEFAULT_PRUNE_CONFIG,
): PruneReport {
  const candidates: PruneCandidate[] = [];

  for (const memory of memories) {
    const { score, signals } = computePruneScore(memory, config);
    const { protected: isProtected, reasons: protectionReasons } = isProtectedMemory(memory);

    const riskLevel = classifyRisk(score);

    const candidate: PruneCandidate = {
      memoryId: memory.id,
      action: "would_archive",
      riskLevel,
      reason: reasonForPrune(score, signals, protectionReasons),
      tokensSaved: estimateTokens(memory.content || ""),
      signals,
      protected: isProtected,
      protectionReasons,
    };

    candidates.push(candidate);
  }

  candidates.sort((a, b) => {
    if (a.protected !== b.protected) return a.protected ? 1 : -1;
    if (a.riskLevel === "high" && b.riskLevel !== "high") return 1;
    if (b.riskLevel === "high" && a.riskLevel !== "high") return -1;
    const riskOrder = { low: 0, medium: 1, high: 2 };
    return (riskOrder[b.riskLevel] ?? 0) - (riskOrder[a.riskLevel] ?? 0);
  });

  const prunable = candidates.filter((c) => !c.protected && c.riskLevel === "low");
  const limited = prunable.slice(0, config.maxCandidates);

  const totalTokensSaved = limited.reduce((sum, c) => sum + c.tokensSaved, 0);
  const riskDistribution = {
    low: candidates.filter((c) => c.riskLevel === "low").length,
    medium: candidates.filter((c) => c.riskLevel === "medium").length,
    high: candidates.filter((c) => c.riskLevel === "high").length,
  };

  return {
    candidates: limited,
    totalCandidates: candidates.length,
    totalTokensSaved,
    riskDistribution,
    protectedCount: candidates.filter((c) => c.protected).length,
    prunableCount: prunable.length,
    dryRun: config.dryRun !== false,
  };
}

export function computeAgeDays_(createdAt: Date): number {
  return computeAgeDays(createdAt);
}

export function computeEntityDensity_(content: string): number {
  return computeEntityDensity(content);
}

export function isProtectedMemory_(memory: Memory): { protected: boolean; reasons: string[] } {
  return isProtectedMemory(memory);
}

export function computePruneScore_(memory: Memory, config: PruneConfig): { score: number; signals: PruneSignal } {
  return computePruneScore(memory, config);
}

export function buildReason_(signals: PruneSignal, protectionReasons: string[]): string {
  return reasonForPrune(0, signals, protectionReasons);
}

export function classifyRisk_(score: number): PruneRiskLevel {
  return classifyRisk(score);
}

export function buildPruneReport_(memories: Memory[], config: PruneConfig): PruneReport {
  return pruneMemories(memories, config);
}
