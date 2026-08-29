import { z } from 'zod';
import { isoDateTime, uuid } from './common';

export const toolRiskSchema = z.enum(['read_only', 'low', 'consequential', 'destructive']);
export type ToolRisk = z.infer<typeof toolRiskSchema>;

export const toolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  risk: toolRiskSchema,
  requiresConfirmation: z.boolean(),
  enabled: z.boolean(),
});
export type ToolDefinition = z.infer<typeof toolDefinitionSchema>;

export const toolExecutionStatusSchema = z.enum([
  'proposed',
  'awaiting_confirmation',
  'confirmed',
  'rejected',
  'executing',
  'succeeded',
  'failed',
  'expired',
]);
export type ToolExecutionStatus = z.infer<typeof toolExecutionStatusSchema>;

export const toolExecutionSchema = z.object({
  id: uuid,
  conversationId: uuid,
  toolName: z.string(),
  status: toolExecutionStatusSchema,
  /** Sanitized result; never raw backend payloads. */
  resultSummary: z.string().nullable(),
  errorCode: z.string().nullable(),
  createdAt: isoDateTime,
});
export type ToolExecution = z.infer<typeof toolExecutionSchema>;

export const confirmToolRequestSchema = z.object({
  confirmationId: uuid,
  decision: z.enum(['approve', 'reject']),
});

// ── Widget session ──────────────────────────────────────────────────────────
export const widgetTokenRequestSchema = z.object({
  /** Public widget key identifying the widget configuration. */
  widgetKey: z.string().min(8),
  /** Optional external customer identity claim, verified server-side via HMAC. */
  customer: z
    .object({
      externalId: z.string().max(200),
      hmac: z.string(),
      email: z.string().email().optional(),
      name: z.string().max(200).optional(),
    })
    .optional(),
});
export const widgetTokenResponseSchema = z.object({
  token: z.string(),
  expiresAt: isoDateTime,
  branding: z.object({
    title: z.string(),
    primaryColor: z.string(),
    locale: z.string(),
  }),
});
