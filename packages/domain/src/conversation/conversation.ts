import { type ConversationId, type CustomerId, type OrganizationId, type UserId } from '../ids';
import { TenantMismatchError } from '../errors';
import {
  type ConversationStatus,
  assertTransition,
  isHumanControlled,
} from './state-machine';

export type ConversationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface ConversationProps {
  id: ConversationId;
  organizationId: OrganizationId;
  customerId: CustomerId | null;
  status: ConversationStatus;
  priority: ConversationPriority;
  subject: string | null;
  assignedAgentId: UserId | null;
  escalationReasonCode: string | null;
  language: string | null;
  intent: string | null;
  sentiment: string | null;
  urgency: string | null;
  tags: string[];
  lastMessageAt: Date | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Conversation aggregate. All status changes go through `transitionTo` so the
 * state machine is the single enforcement point.
 */
export class Conversation {
  private constructor(private readonly props: ConversationProps) {}

  static fromProps(props: ConversationProps): Conversation {
    return new Conversation({ ...props, tags: [...props.tags] });
  }

  static start(input: {
    id: ConversationId;
    organizationId: OrganizationId;
    customerId: CustomerId | null;
    subject: string | null;
    now: Date;
  }): Conversation {
    return new Conversation({
      id: input.id,
      organizationId: input.organizationId,
      customerId: input.customerId,
      status: 'open_ai',
      priority: 'normal',
      subject: input.subject,
      assignedAgentId: null,
      escalationReasonCode: null,
      language: null,
      intent: null,
      sentiment: null,
      urgency: null,
      tags: [],
      lastMessageAt: null,
      firstResponseAt: null,
      resolvedAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  get id(): ConversationId {
    return this.props.id;
  }
  get organizationId(): OrganizationId {
    return this.props.organizationId;
  }
  get status(): ConversationStatus {
    return this.props.status;
  }
  get assignedAgentId(): UserId | null {
    return this.props.assignedAgentId;
  }
  get humanControlled(): boolean {
    return isHumanControlled(this.props.status);
  }

  assertOwnedBy(organizationId: OrganizationId): void {
    if (this.props.organizationId !== organizationId) {
      throw new TenantMismatchError();
    }
  }

  transitionTo(next: ConversationStatus, now: Date): void {
    assertTransition(this.props.status, next);
    this.props.status = next;
    this.props.updatedAt = now;
    if (next === 'resolved') {
      this.props.resolvedAt = now;
    }
    if (next === 'open_ai') {
      // Reopen clears prior resolution and human assignment.
      this.props.resolvedAt = null;
      this.props.assignedAgentId = null;
      this.props.escalationReasonCode = null;
    }
  }

  escalate(reasonCode: string, now: Date): void {
    this.transitionTo('escalated', now);
    this.props.escalationReasonCode = reasonCode;
  }

  assignAgent(agentId: UserId, now: Date): void {
    this.transitionTo('assigned_human', now);
    this.props.assignedAgentId = agentId;
  }

  recordCustomerMessage(now: Date): void {
    this.props.lastMessageAt = now;
    this.props.updatedAt = now;
  }

  recordResponse(now: Date): void {
    this.props.lastMessageAt = now;
    if (this.props.firstResponseAt === null) {
      this.props.firstResponseAt = now;
    }
    this.props.updatedAt = now;
  }

  applyClassification(input: {
    language?: string;
    intent?: string;
    sentiment?: string;
    urgency?: string;
    now: Date;
  }): void {
    if (input.language !== undefined) this.props.language = input.language;
    if (input.intent !== undefined) this.props.intent = input.intent;
    if (input.sentiment !== undefined) this.props.sentiment = input.sentiment;
    if (input.urgency !== undefined) this.props.urgency = input.urgency;
    this.props.updatedAt = input.now;
  }

  toProps(): ConversationProps {
    return { ...this.props, tags: [...this.props.tags] };
  }
}
