export type ValueSource = 'known' | 'inferred';

export interface TaggedValue {
  claim: string;
  source: ValueSource;
  evidence: string;
  confidence: number;
}

export interface ValueSourceGuardResult {
  values: TaggedValue[];
  knownCount: number;
  inferredCount: number;
  hasUnlabeledInferred: boolean;
}

const INFERENCE_MARKERS = [
  'seems to prefer',
  'likely values',
  'probably cares about',
  'appears to',
  'based on patterns',
  'inferred from',
  'suggests that',
  'consistent with',
  'it looks like',
  'the pattern suggests',
] as const;

export function detectUnlabeledInferences(text: string): string[] {
  const found: string[] = [];
  for (const marker of INFERENCE_MARKERS) {
    if (text.toLowerCase().includes(marker)) {
      found.push(marker);
    }
  }
  return found;
}

export function classifyValueClaim(
  claim: string,
  hasStoredMemory: boolean,
  confidence: number
): TaggedValue {
  if (hasStoredMemory && confidence >= 0.7) {
    return { claim, source: 'known', evidence: 'stored memory with sufficient confidence', confidence };
  }
  return { claim, source: 'inferred', evidence: 'no stored memory backing this claim', confidence };
}

export function guardValueSources(
  claims: Array<{ claim: string; hasStoredMemory: boolean; confidence: number }>
): ValueSourceGuardResult {
  const values = claims.map(c => classifyValueClaim(c.claim, c.hasStoredMemory, c.confidence));
  const knownCount = values.filter(v => v.source === 'known').length;
  const inferredCount = values.filter(v => v.source === 'inferred').length;

  const hasUnlabeledInferred = inferredCount > 0;

  return { values, knownCount, inferredCount, hasUnlabeledInferred };
}
