import { describe, expect, it } from 'vitest';
import {
  Conversation,
  TenantMismatchError,
  asId,
  permissionsForRole,
  roleHasPermission,
  assertToolTransition,
  riskRequiresConfirmation,
  InvariantViolationError,
} from '../src';

const now = new Date('2026-01-01T00:00:00Z');

function newConversation() {
  return Conversation.start({
    id: asId('11111111-1111-1111-1111-111111111111'),
    organizationId: asId('22222222-2222-2222-2222-222222222222'),
    customerId: null,
    subject: 'Order help',
    now,
  });
}

describe('Conversation aggregate', () => {
  it('starts AI-controlled and tracks first response', () => {
    const c = newConversation();
    expect(c.status).toBe('open_ai');
    c.recordResponse(now);
    expect(c.toProps().firstResponseAt).toEqual(now);
    c.recordResponse(new Date('2026-01-02T00:00:00Z'));
    expect(c.toProps().firstResponseAt).toEqual(now); // first response is immutable
  });

  it('enforces tenant ownership', () => {
    const c = newConversation();
    expect(() => c.assertOwnedBy(asId('33333333-3333-3333-3333-333333333333'))).toThrow(
      TenantMismatchError,
    );
  });

  it('escalates with a reason code and assigns an agent', () => {
    const c = newConversation();
    c.escalate('customer.requested_human', now);
    expect(c.status).toBe('escalated');
    expect(c.toProps().escalationReasonCode).toBe('customer.requested_human');
    c.assignAgent(asId('44444444-4444-4444-4444-444444444444'), now);
    expect(c.status).toBe('assigned_human');
    expect(c.humanControlled).toBe(true);
  });

  it('clears assignment and resolution on reopen', () => {
    const c = newConversation();
    c.transitionTo('resolved', now);
    c.transitionTo('open_ai', now);
    const p = c.toProps();
    expect(p.resolvedAt).toBeNull();
    expect(p.assignedAgentId).toBeNull();
  });
});

describe('permissions', () => {
  it('agents cannot manage members or delete data', () => {
    expect(roleHasPermission('agent', 'org:members:manage')).toBe(false);
    expect(roleHasPermission('agent', 'data:delete')).toBe(false);
    expect(roleHasPermission('agent', 'conversations:respond')).toBe(true);
  });
  it('only owner can delete tenant data', () => {
    expect(roleHasPermission('owner', 'data:delete')).toBe(true);
    expect(roleHasPermission('admin', 'data:delete')).toBe(false);
  });
  it('analyst is read-only for conversations', () => {
    const perms = permissionsForRole('analyst');
    expect(perms).toContain('conversations:read');
    expect(perms).not.toContain('conversations:respond');
  });
});

describe('tool execution transitions', () => {
  it('requires confirmation flow for consequential risk', () => {
    expect(riskRequiresConfirmation('consequential')).toBe(true);
    expect(riskRequiresConfirmation('read_only')).toBe(false);
  });
  it('rejects executing a rejected proposal', () => {
    expect(() => assertToolTransition('rejected', 'executing')).toThrow(InvariantViolationError);
  });
  it('allows the confirmation happy path', () => {
    assertToolTransition('proposed', 'awaiting_confirmation');
    assertToolTransition('awaiting_confirmation', 'confirmed');
    assertToolTransition('confirmed', 'executing');
    assertToolTransition('executing', 'succeeded');
  });
});
