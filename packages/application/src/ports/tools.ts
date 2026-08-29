import { type ZodTypeAny, type infer as ZodInfer } from 'zod';
import { type ConversationId, type CustomerId, type OrganizationId, type ToolRisk } from '@acs/domain';

export interface ToolContext {
  organizationId: OrganizationId;
  conversationId: ConversationId;
  /** Verified customer identity; null for anonymous widget sessions. */
  customerId: CustomerId | null;
  /** Idempotency key for the execution; handlers must honor it for writes. */
  idempotencyKey: string;
}

export interface ToolHandler<
  In extends ZodTypeAny = ZodTypeAny,
  Out extends ZodTypeAny = ZodTypeAny,
> {
  name: string;
  description: string;
  inputSchema: In;
  outputSchema: Out;
  risk: ToolRisk;
  /** Overrides risk-based default when true. */
  requiresConfirmation: boolean;
  timeoutMs: number;
  /** Human/customer facing summary of what will happen, for confirmations. */
  summarize(args: ZodInfer<In>): string;
  /**
   * Executes the already-authorized operation. Must verify tenant ownership
   * of every referenced backend resource and be idempotent for writes.
   */
  execute(ctx: ToolContext, args: ZodInfer<In>): Promise<ZodInfer<Out>>;
  /** Strips internal fields before the result reaches the model or client. */
  sanitizeResult(result: ZodInfer<Out>): Record<string, unknown>;
}

export interface ToolRegistryPort {
  /** Returns the handler only when the tool is enabled for the tenant. */
  getEnabled(organizationId: OrganizationId, name: string): Promise<ToolHandler | null>;
  listEnabled(organizationId: OrganizationId): Promise<ToolHandler[]>;
}
