import { describe, expect, it } from 'vitest';
import { allowedStatusTransitions, canTransitionStatus } from './status';

describe('status transitions', () => {
  it('allows agent handoff from AI handling', () => {
    expect(canTransitionStatus('open_ai', 'assigned_human')).toBe(true);
  });

  it('prevents reopening closed conversations client-side', () => {
    expect(allowedStatusTransitions('closed')).toEqual([]);
  });
});
