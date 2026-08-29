import { describe, expect, it } from 'vitest';
import { aggregate, scoreCase, validateCitations } from '../src/metrics';

describe('retrieval metrics', () => {
  it('computes recall, precision, and reciprocal rank for a hit at rank 2', () => {
    const result = scoreCase({
      id: 'case',
      expectedTitles: ['Shipping Policy'],
      retrieved: [
        { title: 'Return Policy', score: 0.9 },
        { title: 'Shipping Policy', score: 0.8 },
        { title: 'Warranty FAQ', score: 0.2 },
      ],
      k: 3,
    });
    expect(result.recallAtK).toBe(1);
    expect(result.precisionAtK).toBeCloseTo(1 / 3);
    expect(result.reciprocalRank).toBeCloseTo(0.5);
  });

  it('scores zero when nothing relevant is retrieved', () => {
    const result = scoreCase({
      id: 'miss',
      expectedTitles: ['Shipping Policy'],
      retrieved: [{ title: 'Warranty FAQ', score: 0.4 }],
      k: 5,
    });
    expect(result.recallAtK).toBe(0);
    expect(result.reciprocalRank).toBe(0);
  });

  it('honors K by ignoring results beyond the cutoff', () => {
    const result = scoreCase({
      id: 'cutoff',
      expectedTitles: ['Shipping Policy'],
      retrieved: [
        { title: 'A', score: 1 },
        { title: 'B', score: 0.9 },
        { title: 'Shipping Policy', score: 0.8 },
      ],
      k: 2,
    });
    expect(result.recallAtK).toBe(0);
  });

  it('aggregates mean metrics across cases', () => {
    const summary = aggregate([
      { id: 'a', recallAtK: 1, precisionAtK: 0.5, reciprocalRank: 1, retrievedTitles: [] },
      { id: 'b', recallAtK: 0, precisionAtK: 0, reciprocalRank: 0, retrievedTitles: [] },
    ]);
    expect(summary.recallAtK).toBe(0.5);
    expect(summary.mrr).toBe(0.5);
  });
});

describe('citation validation', () => {
  it('flags fabricated citation indexes', () => {
    const result = validateCitations({ citedIndexes: [0, 7], retrievedCount: 2 });
    expect(result.fabricated).toBe(true);
    expect(result.validFraction).toBe(0.5);
  });

  it('accepts citations that map to retrieved evidence', () => {
    const result = validateCitations({ citedIndexes: [0, 1], retrievedCount: 2 });
    expect(result.fabricated).toBe(false);
    expect(result.validFraction).toBe(1);
  });
});
