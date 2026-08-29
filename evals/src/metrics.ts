export interface RankedResult {
  title: string;
  score: number;
}

export interface CaseMetrics {
  id: string;
  recallAtK: number;
  precisionAtK: number;
  reciprocalRank: number;
  retrievedTitles: string[];
}

/**
 * Deterministic retrieval metrics. Matching is by document title within the
 * querying organization; expected titles come from the versioned golden dataset.
 */
export function scoreCase(input: {
  id: string;
  expectedTitles: string[];
  retrieved: RankedResult[];
  k: number;
}): CaseMetrics {
  const topK = input.retrieved.slice(0, input.k);
  const retrievedTitles = topK.map((r) => r.title);
  const expected = new Set(input.expectedTitles);
  const hits = retrievedTitles.filter((title) => expected.has(title));
  const uniqueHits = new Set(hits);
  const recallAtK = expected.size === 0 ? 1 : uniqueHits.size / expected.size;
  const precisionAtK = topK.length === 0 ? 0 : hits.length / topK.length;
  const firstHitIndex = retrievedTitles.findIndex((title) => expected.has(title));
  const reciprocalRank = firstHitIndex === -1 ? 0 : 1 / (firstHitIndex + 1);
  return { id: input.id, recallAtK, precisionAtK, reciprocalRank, retrievedTitles };
}

export interface AggregateMetrics {
  recallAtK: number;
  precisionAtK: number;
  mrr: number;
  cases: CaseMetrics[];
}

export function aggregate(cases: CaseMetrics[]): AggregateMetrics {
  const mean = (values: number[]): number =>
    values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
  return {
    recallAtK: mean(cases.map((c) => c.recallAtK)),
    precisionAtK: mean(cases.map((c) => c.precisionAtK)),
    mrr: mean(cases.map((c) => c.reciprocalRank)),
    cases,
  };
}

/**
 * Citation correctness: every cited index must map to actually retrieved
 * evidence. Returns the fraction of citations that are valid and whether the
 * answer should have been rejected.
 */
export function validateCitations(input: {
  citedIndexes: number[];
  retrievedCount: number;
}): { validFraction: number; fabricated: boolean } {
  if (input.citedIndexes.length === 0) return { validFraction: 1, fabricated: false };
  const valid = input.citedIndexes.filter(
    (index) => Number.isInteger(index) && index >= 0 && index < input.retrievedCount,
  );
  return {
    validFraction: valid.length / input.citedIndexes.length,
    fabricated: valid.length < input.citedIndexes.length,
  };
}
