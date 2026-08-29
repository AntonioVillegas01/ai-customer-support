import { z } from 'zod';
import { isoDateTime, uuid } from './common';

export const knowledgeSourceTypeSchema = z.enum(['file', 'url', 'faq']);
export type KnowledgeSourceType = z.infer<typeof knowledgeSourceTypeSchema>;

export const ingestionStatusSchema = z.enum([
  'pending',
  'processing',
  'indexed',
  'failed',
  'cancelled',
]);
export type IngestionStatus = z.infer<typeof ingestionStatusSchema>;

export const createFaqRequestSchema = z.object({
  question: z.string().min(1).max(1000),
  answer: z.string().min(1).max(20000),
  tags: z.array(z.string().max(64)).max(20).default([]),
});

export const createUrlSourceRequestSchema = z.object({
  url: z.string().url(),
  tags: z.array(z.string().max(64)).max(20).default([]),
});

export const knowledgeSourceSchema = z.object({
  id: uuid,
  organizationId: uuid,
  type: knowledgeSourceTypeSchema,
  name: z.string(),
  tags: z.array(z.string()),
  activeVersionId: uuid.nullable(),
  latestIngestionStatus: ingestionStatusSchema.nullable(),
  createdAt: isoDateTime,
});
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

export const ingestionJobSchema = z.object({
  id: uuid,
  sourceId: uuid,
  status: ingestionStatusSchema,
  progress: z.number().min(0).max(100),
  error: z.string().nullable(),
  startedAt: isoDateTime.nullable(),
  finishedAt: isoDateTime.nullable(),
});
export type IngestionJob = z.infer<typeof ingestionJobSchema>;
