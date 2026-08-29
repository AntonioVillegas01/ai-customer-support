import { describe, expect, it } from 'vitest';
import { evaluateEscalation, type EscalationSignals } from '../src';

const base: EscalationSignals = {
  intent: 'order_status',
  sentiment: 'neutral',
  urgency: 'normal',
  safetyFlags: [],
  customerRequestedHuman: false,
  retrievalTopScore: 0.8,
  evidenceSufficient: true,
  consecutiveFailedAnswers: 0,
  toolFailed: false,
};

describe('escalation policy', () => {
  it('does not escalate a healthy interaction', () => {
    const d = evaluateEscalation(base);
    expect(d.escalate).toBe(false);
    expect(d.reasonCode).toBeNull();
  });

  it('escalates safety flags with the highest priority and machine-readable codes', () => {
    const d = evaluateEscalation({
      ...base,
      safetyFlags: ['self_harm'],
      customerRequestedHuman: true,
    });
    expect(d.escalate).toBe(true);
    expect(d.reasonCode).toBe('safety.self_harm');
    expect(d.explanation).toBeTruthy();
  });

  it('escalates explicit human requests', () => {
    const d = evaluateEscalation({ ...base, customerRequestedHuman: true });
    expect(d).toMatchObject({ escalate: true, reasonCode: 'customer.requested_human' });
  });

  it('escalates abusive sentiment and tool failures', () => {
    expect(evaluateEscalation({ ...base, sentiment: 'abusive' }).reasonCode).toBe(
      'customer.abusive',
    );
    expect(evaluateEscalation({ ...base, toolFailed: true }).reasonCode).toBe('tool.failed');
  });

  it('escalates after repeated failed answers', () => {
    const d = evaluateEscalation({ ...base, consecutiveFailedAnswers: 2 });
    expect(d).toMatchObject({ escalate: true, reasonCode: 'ai.repeated_failures' });
  });

  it('abstains (without escalation) on insufficient evidence', () => {
    const d = evaluateEscalation({ ...base, evidenceSufficient: false });
    expect(d.escalate).toBe(false);
    expect(d.reasonCode).toBe('ai.insufficient_evidence');
  });

  it('abstains on low retrieval confidence', () => {
    const d = evaluateEscalation({ ...base, retrievalTopScore: 0.1 });
    expect(d.escalate).toBe(false);
    expect(d.reasonCode).toBe('ai.low_confidence_retrieval');
  });
});
