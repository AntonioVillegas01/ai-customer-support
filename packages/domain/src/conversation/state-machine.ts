import { InvalidStateTransitionError } from '../errors';

export type ConversationStatus =
  | 'open_ai'
  | 'pending_customer'
  | 'escalated'
  | 'assigned_human'
  | 'resolved'
  | 'closed';

/**
 * Conversation lifecycle state machine.
 *
 *  open_ai ⇄ pending_customer      AI answers and waits for the customer.
 *  {open_ai, pending_customer} → escalated       Policy or explicit request.
 *  escalated → assigned_human                    An agent picks up.
 *  assigned_human → escalated                    Transfer back to queue.
 *  any active state → resolved
 *  resolved → closed | open_ai (reopen)
 *  closed → open_ai (reopen). All other closed transitions are invalid.
 */
const TRANSITIONS: Record<ConversationStatus, readonly ConversationStatus[]> = {
  open_ai: ['pending_customer', 'escalated', 'assigned_human', 'resolved'],
  pending_customer: ['open_ai', 'escalated', 'assigned_human', 'resolved'],
  escalated: ['assigned_human', 'resolved', 'open_ai'],
  assigned_human: ['resolved', 'escalated'],
  resolved: ['closed', 'open_ai'],
  closed: ['open_ai'],
};

export function canTransition(from: ConversationStatus, to: ConversationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ConversationStatus, to: ConversationStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

/** States in which the AI is allowed to generate replies autonomously. */
export function isAiControlled(status: ConversationStatus): boolean {
  return status === 'open_ai' || status === 'pending_customer';
}

/** States in which a human owns the conversation; AI may only suggest. */
export function isHumanControlled(status: ConversationStatus): boolean {
  return status === 'escalated' || status === 'assigned_human';
}

export function acceptsCustomerMessages(status: ConversationStatus): boolean {
  return status !== 'closed';
}
