import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { asId, Conversation, type OrganizationId } from '@acs/domain';
import { type EmbeddingProviderPort } from '@acs/application';
import {
  chunks,
  closeDb,
  conversations,
  createDb,
  documentVersions,
  documents,
  DrizzleConversationRepository,
  DrizzleMessageRepository,
  DrizzleOutbox,
  DrizzleToolExecutionRepository,
  DrizzleUnitOfWork,
  HybridRetrievalAdapter,
  knowledgeSources,
  organizations,
  outboxEvents,
  type Database,
} from '../src';

const baseUrl = process.env.DATABASE_URL ?? 'postgres://acs:acs_local_dev@localhost:5433/acs';

class DeterministicEmbeddingProvider implements EmbeddingProviderPort {
  async embed(texts: string[]): Promise<{ vectors: number[][]; usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number } }> {
    return {
      vectors: texts.map((text) => pseudoEmbedding(text)),
      usage: { inputTokens: texts.length * 10, outputTokens: 0, estimatedCostUsd: 0 },
    };
  }
}

describe('persistence integration', () => {
  let databaseName = '';
  let databaseUrl = '';
  let db: Database | null = null;
  let pool: Pool | null = null;

  beforeEach(async () => {
    const created = await createTestDatabase();
    databaseName = created.databaseName;
    databaseUrl = created.databaseUrl;
    const connection = createDb({ databaseUrl, poolMax: 4 });
    db = connection.db;
    pool = connection.pool;
    await applyMigrations(pool);
  });

  afterEach(async () => {
    if (pool !== null) await closeDb(pool);
    pool = null;
    db = null;
    if (databaseName.length > 0) await dropTestDatabase(databaseName);
  });

  test('migrations apply from a clean database', async () => {
    const row = await pool.query<{ table_name: string }>("select table_name from information_schema.tables where table_name = 'conversations'");
    expect(row.rowCount).toBe(1);
  });

  test('conversation save/find round-trip preserves fields and enforces tenant isolation', async () => {
    const orgA = await insertOrg(db, 'org-a');
    const orgB = await insertOrg(db, 'org-b');
    const now = new Date('2026-01-02T03:04:05.000Z');
    const conversation = Conversation.fromProps({
      id: asId<'ConversationId'>(randomUUID()),
      organizationId: orgA,
      customerId: null,
      status: 'open_ai',
      priority: 'high',
      subject: 'Shipping status',
      assignedAgentId: null,
      escalationReasonCode: null,
      language: 'en',
      intent: 'shipping_question',
      sentiment: 'neutral',
      urgency: 'normal',
      tags: ['shipping', 'vip'],
      lastMessageAt: now,
      firstResponseAt: now,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const repo = new DrizzleConversationRepository(db);
    await repo.save(conversation);
    const found = await repo.findById(orgA, conversation.id);
    const wrongOrg = await repo.findById(orgB, conversation.id);
    expect(found?.toProps()).toEqual(conversation.toProps());
    expect(wrongOrg).toBeNull();
  });

  test('message idempotency is scoped to organization and conversation', async () => {
    const orgA = await insertOrg(db, 'idem-a');
    const orgB = await insertOrg(db, 'idem-b');
    const convA = await insertConversation(db, orgA);
    const convB = await insertConversation(db, orgB);
    const repo = new DrizzleMessageRepository(db);
    const message = {
      id: asId<'MessageId'>(randomUUID()),
      conversationId: convA,
      organizationId: orgA,
      role: 'customer' as const,
      content: 'Hello',
      processingState: 'accepted' as const,
      idempotencyKey: 'same-key',
      aiGenerated: false,
      citations: [],
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
    };
    await repo.insert(message);
    await expect(repo.insert({ ...message, id: asId<'MessageId'>(randomUUID()) })).rejects.toThrow(/idempotency/i);
    await repo.insert({ ...message, id: asId<'MessageId'>(randomUUID()), organizationId: orgB, conversationId: convB });
  });

  test('hybrid retrieval only returns active indexed chunks for the requested tenant', async () => {
    const orgA = await insertOrg(db, 'retrieval-a');
    const orgB = await insertOrg(db, 'retrieval-b');
    const activeA = await insertKnowledgeChunk(db, orgA, 'Shipping Policy', 'Shared overlapterm shipping answer for Acme only.', 'indexed', true);
    const activeB = await insertKnowledgeChunk(db, orgB, 'Shipping Policy', 'Shared overlapterm shipping answer for Globex only.', 'indexed', true);
    const failedA = await insertKnowledgeChunk(db, orgA, 'Failed Policy', 'failedonlyterm should not be retrieved.', 'failed', false);
    const inactiveA = await insertKnowledgeChunk(db, orgA, 'Inactive Policy', 'inactiveonlyterm should not be retrieved.', 'indexed', false);
    const retrieval = new HybridRetrievalAdapter(db, new DeterministicEmbeddingProvider());
    const results = await retrieval.search({ organizationId: orgA, query: 'overlapterm failedonlyterm inactiveonlyterm', limit: 10, minScore: 0 });
    const chunkIds = results.map((result) => result.chunkId);
    expect(chunkIds).toContain(activeA.chunkId);
    expect(chunkIds).not.toContain(activeB.chunkId);
    expect(chunkIds).not.toContain(failedA.chunkId);
    expect(chunkIds).not.toContain(inactiveA.chunkId);
    expect(results.every((result) => result.content.includes('Acme'))).toBe(true);
  });

  test('tool execution idempotency keys are unique per organization', async () => {
    const orgA = await insertOrg(db, 'tool-a');
    const orgB = await insertOrg(db, 'tool-b');
    const convA = await insertConversation(db, orgA);
    const convB = await insertConversation(db, orgB);
    const repo = new DrizzleToolExecutionRepository(db);
    const execution = {
      id: randomUUID(),
      organizationId: orgA,
      conversationId: convA,
      toolName: 'lookup_order',
      status: 'proposed' as const,
      argsJson: '{"orderNumber":"ORD-1001"}',
      resultSummary: null,
      errorCode: null,
      idempotencyKey: 'tool-key',
      confirmationExpiresAt: null,
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      updatedAt: new Date('2026-01-02T03:04:05.000Z'),
    };
    await repo.insert(execution);
    await expect(repo.insert({ ...execution, id: randomUUID() })).rejects.toThrow(/idempotency/i);
    await repo.insert({ ...execution, id: randomUUID(), organizationId: orgB, conversationId: convB });
  });

  test('outbox publish rolls back inside a failed unit of work transaction', async () => {
    const org = await insertOrg(db, 'outbox');
    const uow = new DrizzleUnitOfWork(db);
    await expect(
      uow.run(async (tx) => {
        await tx.outbox.publish({ id: randomUUID(), type: 'test.event', organizationId: org, payload: { ok: true }, occurredAt: new Date() });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    const rows = await db.select().from(outboxEvents).where(eq(outboxEvents.organizationId, org));
    expect(rows).toHaveLength(0);
  });
});

async function createTestDatabase(): Promise<{ databaseName: string; databaseUrl: string }> {
  const databaseName = `acs_test_${process.pid}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const admin = new Pool({ connectionString: baseUrl });
  try {
    await admin.query(`create database ${databaseName}`);
  } finally {
    await admin.end();
  }
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return { databaseName, databaseUrl: url.toString() };
}

async function dropTestDatabase(databaseName: string): Promise<void> {
  if (!/^acs_test_[a-zA-Z0-9_]+$/.test(databaseName)) throw new Error('Unsafe test database name');
  const admin = new Pool({ connectionString: baseUrl });
  try {
    await admin.query(`drop database if exists ${databaseName} with (force)`);
  } finally {
    await admin.end();
  }
}

async function applyMigrations(pool: Pool): Promise<void> {
  const migration = await readFile(join(process.cwd(), 'drizzle', '0000_mighty_rhodey.sql'), 'utf8');
  const statements = migration.split('--> statement-breakpoint').map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function insertOrg(db: Database, slug: string): Promise<OrganizationId> {
  const rows = await db.insert(organizations).values({ name: slug, slug }).returning({ id: organizations.id });
  const row = rows[0];
  if (row === undefined) throw new Error('Expected organization row');
  return asId<'OrganizationId'>(row.id);
}

async function insertConversation(db: Database, organizationId: OrganizationId): Promise<ReturnType<typeof asId<'ConversationId'>>> {
  const rows = await db
    .insert(conversations)
    .values({ id: randomUUID(), organizationId, status: 'open_ai', priority: 'normal' })
    .returning({ id: conversations.id });
  const row = rows[0];
  if (row === undefined) throw new Error('Expected conversation row');
  return asId<'ConversationId'>(row.id);
}

async function insertKnowledgeChunk(
  db: Database,
  organizationId: OrganizationId,
  title: string,
  content: string,
  status: string,
  active: boolean,
): Promise<{ chunkId: string }> {
  const source = first(await db.insert(knowledgeSources).values({ organizationId, type: 'faq', name: title, tags: ['shipping'] }).returning());
  const doc = first(await db.insert(documents).values({ organizationId, sourceId: source.id, title }).returning());
  const version = first(
    await db
      .insert(documentVersions)
      .values({ organizationId, documentId: doc.id, version: 1, contentHash: randomUUID(), status })
      .returning(),
  );
  const chunk = first(
    await db
      .insert(chunks)
      .values({ organizationId, documentVersionId: version.id, chunkIndex: 0, title, content, embedding: pseudoEmbedding(content) })
      .returning({ id: chunks.id }),
  );
  if (active) await db.update(knowledgeSources).set({ activeVersionId: version.id }).where(eq(knowledgeSources.id, source.id));
  return { chunkId: chunk.id };
}

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected database row');
  return row;
}

function pseudoEmbedding(text: string, dimensions = 1536): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (let index = 0; index < text.length; index += 1) {
    const bucket = index % dimensions;
    const current = vector[bucket] ?? 0;
    vector[bucket] = current + text.charCodeAt(index) / 1000;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}
