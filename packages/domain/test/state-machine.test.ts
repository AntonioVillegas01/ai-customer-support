import { describe, expect, it } from 'vitest';
import {
  acceptsCustomerMessages,
  assertTransition,
  canTransition,
  isAiControlled,
  isHumanControlled,
  InvalidStateTransitionError,
  type ConversationStatus,
} from '../src';

const ALL: ConversationStatus[] = [
  'open_ai',
  'pending_customer',
  'escalated',
  'assigned_human',
  'resolved',
  'closed',
];

describe('conversation state machine', () => {
  it('allows the documented happy path', () => {
    expect(canTransition('open_ai', 'pending_customer')).toBe(true);
    expect(canTransition('pending_customer', 'escalated')).toBe(true);
    expect(canTransition('escalated', 'assigned_human')).toBe(true);
    expect(canTransition('assigned_human', 'resolved')).toBe(true);
    expect(canTransition('resolved', 'closed')).toBe(true);
  });

  it('supports reopening', () => {
    expect(canTransition('resolved', 'open_ai')).toBe(true);
    expect(canTransition('closed', 'open_ai')).toBe(true);
  });

  it('rejects invalid transitions with a typed domain error', () => {
    expect(() => assertTransition('closed', 'assigned_human')).toThrow(
      InvalidStateTransitionError,
    );
    expect(canTransition('assigned_human', 'open_ai')).toBe(false);
    expect(canTransition('closed', 'resolved')).toBe(false);
    expect(canTransition('resolved', 'escalated')).toBe(false);
  });

  it('never allows a state to transition to itself', () => {
    for (const s of ALL) {
      expect(canTransition(s, s)).toBe(false);
    }
  });

  it('classifies control ownership correctly', () => {
    expect(isAiControlled('open_ai')).toBe(true);
    expect(isAiControlled('assigned_human')).toBe(false);
    expect(isHumanControlled('escalated')).toBe(true);
    expect(isHumanControlled('open_ai')).toBe(false);
  });

  it('only closed conversations reject customer messages', () => {
    for (const s of ALL) {
      expect(acceptsCustomerMessages(s)).toBe(s !== 'closed');
    }
  });
});
