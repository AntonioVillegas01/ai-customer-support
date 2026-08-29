import { type ConversationStatus } from '@acs/contracts';

const transitions: Record<ConversationStatus, readonly ConversationStatus[]> = {
  open_ai: ['escalated', 'assigned_human', 'resolved', 'closed'],
  pending_customer: ['open_ai', 'escalated', 'assigned_human', 'resolved', 'closed'],
  escalated: ['assigned_human', 'resolved', 'closed'],
  assigned_human: ['pending_customer', 'resolved', 'closed'],
  resolved: ['closed', 'open_ai'],
  closed: [],
};

export function allowedStatusTransitions(status: ConversationStatus): readonly ConversationStatus[] {
  return transitions[status];
}

export function canTransitionStatus(from: ConversationStatus, to: ConversationStatus): boolean {
  return transitions[from].includes(to);
}
