import { z } from 'zod';
import { ErrorCodes } from './error-codes';

/** Consistent API error envelope. Never contains stack traces. */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.nativeEnum(ErrorCodes),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
    correlationId: z.string().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export const cursorPaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type CursorPaginationQuery = z.infer<typeof cursorPaginationQuerySchema>;

export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export const isoDateTime = z.string().datetime({ offset: true });
export const uuid = z.string().uuid();
