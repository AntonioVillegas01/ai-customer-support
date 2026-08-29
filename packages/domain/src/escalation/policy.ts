/**
 * Deterministic escalation policy. Evaluated by application code after
 * classification and retrieval; the LLM never decides escalation alone.
 */
export interface EscalationSignals {
  /** Classifier-detected intent, e.g. 'refund_dispute', 'order_status'. */
  intent: string | null;
  sentiment: 'positive' | 'neutral' | 'negative' | 'abusive' | null;
  urgency: 'low' | 'normal' | 'high' | 'critical' | null;
  /** Deterministic keyword screens run by application code, not the LLM. */
  safetyFlags: readonly ('self_harm' | 'threat' | 'legal' | 'payment_dispute' | 'pii_request')[];
  customerRequestedHuman: boolean;
  retrievalTopScore: number | null;
  evidenceSufficient: boolean;
  consecutiveFailedAnswers: number;
  toolFailed: boolean;
}

export interface EscalationDecision {
  escalate: boolean;
  /** Stable machine-readable reason code. */
  reasonCode: string | null;
  /** Human-readable explanation for agents and audit. */
  explanation: string | null;
}

export const ESCALATION_THRESHOLDS = {
  minRetrievalScore: 0.35,
  maxConsecutiveFailedAnswers: 2,
} as const;

const SAFETY_REASONS: Record<EscalationSignals['safetyFlags'][number], string> = {
  self_harm: 'Message indicates potential self-harm risk',
  threat: 'Message contains a threat',
  legal: 'Message involves a legal or regulatory dispute',
  payment_dispute: 'Message involves a payment dispute',
  pii_request: 'Message requests handling of sensitive personal information',
};

export function evaluateEscalation(signals: EscalationSignals): EscalationDecision {
  const flag = signals.safetyFlags[0];
  if (flag !== undefined) {
    return {
      escalate: true,
      reasonCode: `safety.${flag}`,
      explanation: SAFETY_REASONS[flag],
    };
  }
  if (signals.customerRequestedHuman) {
    return {
      escalate: true,
      reasonCode: 'customer.requested_human',
      explanation: 'Customer explicitly asked for a human agent',
    };
  }
  if (signals.sentiment === 'abusive') {
    return {
      escalate: true,
      reasonCode: 'customer.abusive',
      explanation: 'Customer message classified as abusive',
    };
  }
  if (signals.toolFailed) {
    return {
      escalate: true,
      reasonCode: 'tool.failed',
      explanation: 'An approved support action failed and needs human follow-up',
    };
  }
  if (signals.consecutiveFailedAnswers >= ESCALATION_THRESHOLDS.maxConsecutiveFailedAnswers) {
    return {
      escalate: true,
      reasonCode: 'ai.repeated_failures',
      explanation: 'The assistant repeatedly failed to answer this conversation',
    };
  }
  if (!signals.evidenceSufficient) {
    return {
      escalate: false,
      reasonCode: 'ai.insufficient_evidence',
      explanation:
        'Knowledge base evidence is insufficient; assistant must abstain and offer escalation',
    };
  }
  if (
    signals.retrievalTopScore !== null &&
    signals.retrievalTopScore < ESCALATION_THRESHOLDS.minRetrievalScore
  ) {
    return {
      escalate: false,
      reasonCode: 'ai.low_confidence_retrieval',
      explanation: 'Retrieval confidence below threshold; assistant must abstain',
    };
  }
  return { escalate: false, reasonCode: null, explanation: null };
}
