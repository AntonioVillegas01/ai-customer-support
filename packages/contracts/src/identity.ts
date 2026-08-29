import { z } from 'zod';
import { isoDateTime, uuid } from './common';

// ── Auth ─────────────────────────────────────────────────────────────────────
export const registerRequestSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(128),
  name: z.string().min(1).max(200),
});
export const loginRequestSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});
export const userSchema = z.object({
  id: uuid,
  email: z.string().email(),
  name: z.string(),
  emailVerifiedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type User = z.infer<typeof userSchema>;

// ── Organizations ────────────────────────────────────────────────────────────
export const organizationRoleSchema = z.enum([
  'owner',
  'admin',
  'agent',
  'analyst',
]);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export const createOrganizationRequestSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
});
export const organizationSchema = z.object({
  id: uuid,
  name: z.string(),
  slug: z.string(),
  createdAt: isoDateTime,
});
export type Organization = z.infer<typeof organizationSchema>;

export const membershipSchema = z.object({
  userId: uuid,
  organizationId: uuid,
  role: organizationRoleSchema,
  createdAt: isoDateTime,
});
export type Membership = z.infer<typeof membershipSchema>;

export const inviteMemberRequestSchema = z.object({
  email: z.string().email(),
  role: organizationRoleSchema,
});

// ── API keys ─────────────────────────────────────────────────────────────────
export const createApiKeyRequestSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(['widget:token', 'conversations:read', 'knowledge:write'])).min(1),
});
export const apiKeyCreatedSchema = z.object({
  id: uuid,
  name: z.string(),
  prefix: z.string(),
  /** Full key, shown exactly once at creation. */
  key: z.string(),
  scopes: z.array(z.string()),
  createdAt: isoDateTime,
});
export const apiKeySchema = apiKeyCreatedSchema.omit({ key: true }).extend({
  lastUsedAt: isoDateTime.nullable(),
  revokedAt: isoDateTime.nullable(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;
