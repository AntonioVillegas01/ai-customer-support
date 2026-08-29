import { InvariantViolationError } from '../errors';

export type ToolRisk = 'read_only' | 'low' | 'consequential' | 'destructive';

export type ToolExecutionStatus =
  | 'proposed'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'rejected'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'expired';

const TOOL_TRANSITIONS: Record<ToolExecutionStatus, readonly ToolExecutionStatus[]> = {
  proposed: ['awaiting_confirmation', 'executing', 'rejected'],
  awaiting_confirmation: ['confirmed', 'rejected', 'expired'],
  confirmed: ['executing'],
  executing: ['succeeded', 'failed'],
  rejected: [],
  succeeded: [],
  failed: [],
  expired: [],
};

export function assertToolTransition(from: ToolExecutionStatus, to: ToolExecutionStatus): void {
  if (!TOOL_TRANSITIONS[from].includes(to)) {
    throw new InvariantViolationError(`Invalid tool execution transition '${from}' -> '${to}'`);
  }
}

/** Risk levels that always require explicit customer or agent confirmation. */
export function riskRequiresConfirmation(risk: ToolRisk): boolean {
  return risk === 'consequential' || risk === 'destructive';
}
