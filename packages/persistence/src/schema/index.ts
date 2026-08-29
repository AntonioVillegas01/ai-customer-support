import { sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const textArray = (name: string) => text(name).array();
const jsonbDefaultObject = (name: string) => jsonb(name).$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`);
const jsonbDefaultArray = <T>(name: string) => jsonb(name).$type<T[]>().notNull().default(sql`'[]'::jsonb`);

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    emailVerifiedAt: timestamptz('email_verified_at'),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamptz('locked_until'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_lower_unique').on(sql`lower(${table.email})`)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const memberships = pgTable(
  'memberships',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.organizationId] }),
    check('memberships_role_check', sql`${table.role} in ('owner', 'admin', 'agent', 'analyst')`),
    index('memberships_organization_user_idx').on(table.organizationId, table.userId),
  ],
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    scopes: textArray('scopes').notNull().default(sql`'{}'::text[]`),
    lastUsedAt: timestamptz('last_used_at'),
    revokedAt: timestamptz('revoked_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [index('api_keys_organization_id_idx').on(table.organizationId)],
);

export const widgetConfigs = pgTable(
  'widget_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    publicKey: text('public_key').notNull().unique(),
    title: text('title').notNull(),
    primaryColor: text('primary_color').notNull(),
    locale: text('locale').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (table) => [index('widget_configs_organization_id_idx').on(table.organizationId)],
);

export const widgetAllowedOrigins = pgTable(
  'widget_allowed_origins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    widgetConfigId: uuid('widget_config_id').notNull().references(() => widgetConfigs.id, { onDelete: 'cascade' }),
    origin: text('origin').notNull(),
  },
  (table) => [unique('widget_allowed_origins_config_origin_unique').on(table.widgetConfigId, table.origin)],
);

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    externalId: text('external_id'),
    email: text('email'),
    name: text('name'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('customers_org_external_id_unique').on(table.organizationId, table.externalId).where(sql`${table.externalId} is not null`),
    index('customers_organization_id_idx').on(table.organizationId),
  ],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    status: text('status').notNull(),
    priority: text('priority').notNull().default('normal'),
    subject: text('subject'),
    assignedAgentId: uuid('assigned_agent_id').references(() => users.id, { onDelete: 'set null' }),
    escalationReasonCode: text('escalation_reason_code'),
    language: text('language'),
    intent: text('intent'),
    sentiment: text('sentiment'),
    urgency: text('urgency'),
    tags: textArray('tags').notNull().default(sql`'{}'::text[]`),
    lastMessageAt: timestamptz('last_message_at'),
    firstResponseAt: timestamptz('first_response_at'),
    resolvedAt: timestamptz('resolved_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (table) => [
    check('conversations_status_check', sql`${table.status} in ('open_ai', 'pending_customer', 'escalated', 'assigned_human', 'resolved', 'closed')`),
    check('conversations_priority_check', sql`${table.priority} in ('low', 'normal', 'high', 'urgent')`),
    index('conversations_org_status_idx').on(table.organizationId, table.status),
    index('conversations_org_assigned_agent_idx').on(table.organizationId, table.assignedAgentId),
    index('conversations_org_created_desc_idx').on(table.organizationId, table.createdAt.desc()),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    processingState: text('processing_state').notNull(),
    idempotencyKey: text('idempotency_key'),
    aiGenerated: boolean('ai_generated').notNull().default(false),
    citations: jsonbDefaultArray<unknown>('citations'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    check('messages_role_check', sql`${table.role} in ('customer', 'assistant', 'agent', 'system')`),
    check('messages_processing_state_check', sql`${table.processingState} in ('accepted', 'processing', 'delivered', 'failed')`),
    uniqueIndex('messages_org_conversation_idempotency_unique')
      .on(table.organizationId, table.conversationId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index('messages_org_conversation_created_idx').on(table.organizationId, table.conversationId, table.createdAt),
  ],
);

export const internalNotes = pgTable(
  'internal_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    content: text('content').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [index('internal_notes_org_conversation_idx').on(table.organizationId, table.conversationId)],
);

export const knowledgeSources = pgTable(
  'knowledge_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    name: text('name').notNull(),
    tags: textArray('tags').notNull().default(sql`'{}'::text[]`),
    activeVersionId: uuid('active_version_id'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    deletedAt: timestamptz('deleted_at'),
  },
  (table) => [
    check('knowledge_sources_type_check', sql`${table.type} in ('file', 'url', 'faq')`),
    index('knowledge_sources_organization_id_idx').on(table.organizationId),
  ],
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').notNull().references(() => knowledgeSources.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [index('documents_org_source_idx').on(table.organizationId, table.sourceId)],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    contentHash: text('content_hash').notNull(),
    status: text('status').notNull(),
    storageKey: text('storage_key'),
    error: text('error'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('document_versions_document_version_unique').on(table.documentId, table.version),
    check('document_versions_status_check', sql`${table.status} in ('pending', 'processing', 'indexed', 'failed', 'cancelled')`),
    index('document_versions_org_document_idx').on(table.organizationId, table.documentId),
  ],
);

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    documentVersionId: uuid('document_version_id').notNull().references(() => documentVersions.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    title: text('title').notNull(),
    section: text('section'),
    url: text('url'),
    content: text('content').notNull(),
    contentTsv: tsvector('content_tsv').generatedAlwaysAs((): SQL => sql`to_tsvector('english', content)`),
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('chunks_content_tsv_gin_idx').using('gin', table.contentTsv),
    index('chunks_embedding_hnsw_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
    index('chunks_org_document_version_idx').on(table.organizationId, table.documentVersionId),
  ],
);

export const ingestionJobs = pgTable(
  'ingestion_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id').notNull().references(() => knowledgeSources.id, { onDelete: 'cascade' }),
    documentVersionId: uuid('document_version_id').references(() => documentVersions.id, { onDelete: 'set null' }),
    status: text('status').notNull(),
    progress: integer('progress').notNull().default(0),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    startedAt: timestamptz('started_at'),
    finishedAt: timestamptz('finished_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    check('ingestion_jobs_status_check', sql`${table.status} in ('pending', 'processing', 'indexed', 'failed', 'cancelled')`),
    index('ingestion_jobs_org_source_idx').on(table.organizationId, table.sourceId),
  ],
);

export const promptVersions = pgTable(
  'prompt_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    version: text('version').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    active: boolean('active').notNull().default(false),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [unique('prompt_versions_name_version_unique').on(table.name, table.version)],
);

export const aiRuns = pgTable(
  'ai_runs',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    status: text('status').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 }).notNull(),
    retrievedChunkIds: jsonbDefaultArray<string>('retrieved_chunk_ids'),
    selectedTools: jsonbDefaultArray<string>('selected_tools'),
    validationErrors: jsonb('validation_errors').$type<string[] | null>(),
    failureReason: text('failure_reason'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    check('ai_runs_kind_check', sql`${table.kind} in ('generation', 'classification', 'summarization', 'suggestion', 'embedding')`),
    check('ai_runs_status_check', sql`${table.status} in ('succeeded', 'failed', 'abstained')`),
    index('ai_runs_org_created_idx').on(table.organizationId, table.createdAt),
  ],
);

export const toolDefinitions = pgTable(
  'tool_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    requiresConfirmation: boolean('requires_confirmation').notNull().default(false),
    config: jsonbDefaultObject('config'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('tool_definitions_org_name_unique').on(table.organizationId, table.name)],
);

export const toolExecutions = pgTable(
  'tool_executions',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    toolName: text('tool_name').notNull(),
    status: text('status').notNull(),
    argsJson: jsonb('args_json').$type<Record<string, unknown>>().notNull(),
    resultSummary: text('result_summary'),
    errorCode: text('error_code'),
    idempotencyKey: text('idempotency_key').notNull(),
    confirmationExpiresAt: timestamptz('confirmation_expires_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (table) => [
    check('tool_executions_status_check', sql`${table.status} in ('proposed', 'awaiting_confirmation', 'confirmed', 'rejected', 'executing', 'succeeded', 'failed', 'expired')`),
    unique('tool_executions_org_idempotency_unique').on(table.organizationId, table.idempotencyKey),
    index('tool_executions_org_conversation_idx').on(table.organizationId, table.conversationId),
  ],
);

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    rating: text('rating').notNull(),
    comment: text('comment'),
    source: text('source').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    check('feedback_rating_check', sql`${table.rating} in ('up', 'down')`),
    check('feedback_source_check', sql`${table.source} in ('customer', 'agent')`),
    index('feedback_org_conversation_idx').on(table.organizationId, table.conversationId),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    metadata: jsonbDefaultObject('metadata'),
    occurredAt: timestamptz('occurred_at').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [index('audit_events_org_occurred_desc_idx').on(table.organizationId, table.occurredAt.desc())],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamptz('occurred_at').notNull(),
    processedAt: timestamptz('processed_at'),
    attempts: integer('attempts').notNull().default(0),
  },
  (table) => [index('outbox_events_unprocessed_idx').on(table.processedAt).where(sql`${table.processedAt} is null`)],
);

export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    periodMonth: text('period_month').notNull(),
    aiCostUsd: numeric('ai_cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    tokens: bigint('tokens', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('usage_records_org_period_unique').on(table.organizationId, table.periodMonth)],
);

export const sandboxOrders = pgTable(
  'sandbox_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    orderNumber: text('order_number').notNull(),
    customerEmail: text('customer_email').notNull(),
    status: text('status').notNull(),
    shippingAddress: text('shipping_address').notNull(),
    items: jsonbDefaultArray<Record<string, unknown>>('items'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (table) => [unique('sandbox_orders_org_order_number_unique').on(table.organizationId, table.orderNumber)],
);

export const sandboxReturns = pgTable(
  'sandbox_returns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id').notNull().references(() => sandboxOrders.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    reason: text('reason'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [index('sandbox_returns_org_order_idx').on(table.organizationId, table.orderId)],
);
