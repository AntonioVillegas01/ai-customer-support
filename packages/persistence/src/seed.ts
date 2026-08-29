import { createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import argon2 from 'argon2';
import { closeDb, createDb, type Database } from './db';
import {
  chunks,
  documentVersions,
  documents,
  knowledgeSources,
  memberships,
  organizations,
  sandboxOrders,
  toolDefinitions,
  users,
  widgetAllowedOrigins,
  widgetConfigs,
} from './schema';
import { seedDefaultPrompts } from './adapters/prompt-registry';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://acs:acs_local_dev@localhost:5433/acs';
const poolMax = Number(process.env.DATABASE_POOL_MAX ?? '10');

interface SeedOrg {
  name: string;
  slug: string;
  ownerEmail: string;
  agentEmail: string;
  widgetKey: string;
  orders: { orderNumber: string; status: string; email: string }[];
  docs: { title: string; content: string; tags: string[] }[];
}

const orgs: SeedOrg[] = [
  {
    name: 'Acme Retail',
    slug: 'acme',
    ownerEmail: 'owner@acme.test',
    agentEmail: 'agent@acme.test',
    widgetKey: 'wgt_acme_local_demo_key',
    orders: [
      { orderNumber: 'ORD-1001', status: 'shipped', email: 'customer@acme.test' },
      { orderNumber: 'ORD-1002', status: 'processing', email: 'customer@acme.test' },
    ],
    docs: [
      { title: 'Shipping Policy', content: 'Acme Retail ships standard orders in three business days and express orders overnight.', tags: ['shipping'] },
      { title: 'Return Policy', content: 'Acme Retail accepts returns within thirty days when items are unused.', tags: ['returns'] },
      { title: 'Warranty FAQ', content: 'Acme warranties accessories for one year with proof of purchase.', tags: ['warranty'] },
    ],
  },
  {
    name: 'Globex Support',
    slug: 'globex',
    ownerEmail: 'owner@globex.test',
    agentEmail: 'agent@globex.test',
    widgetKey: 'wgt_globex_local_demo_key',
    orders: [
      { orderNumber: 'ORD-1001', status: 'delayed', email: 'buyer@globex.test' },
      { orderNumber: 'ORD-1002', status: 'delivered', email: 'buyer@globex.test' },
    ],
    docs: [
      { title: 'Shipping Policy', content: 'Globex Support ships freight orders weekly and flags remote deliveries as delayed.', tags: ['shipping'] },
      { title: 'Return Policy', content: 'Globex Support requires return authorization before sending industrial equipment back.', tags: ['returns'] },
      { title: 'Warranty FAQ', content: 'Globex warranties industrial equipment for two years after commissioning.', tags: ['warranty'] },
    ],
  },
];

async function main(): Promise<void> {
  const { db, pool } = createDb({ databaseUrl, poolMax });
  try {
    await seed(db);
  } finally {
    await closeDb(pool);
  }
}

export async function seed(db: Database): Promise<void> {
  const slugs = orgs.map((org) => org.slug);
  const existing = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, slugs));
  if (existing.length > 0) {
    await db.delete(organizations).where(inArray(organizations.id, existing.map((org) => org.id)));
  }
  const passwordHash = await argon2.hash('Password123!Password');
  await seedDefaultPrompts(db);
  for (const org of orgs) {
    const organization = one(await db.insert(organizations).values({ name: org.name, slug: org.slug }).returning());
    const owner = one(
      await db.insert(users).values({ email: org.ownerEmail, name: `${org.name} Owner`, passwordHash }).returning(),
    );
    const agent = one(
      await db.insert(users).values({ email: org.agentEmail, name: `${org.name} Agent`, passwordHash }).returning(),
    );
    await db.insert(memberships).values([
      { organizationId: organization.id, userId: owner.id, role: 'owner' },
      { organizationId: organization.id, userId: agent.id, role: 'agent' },
    ]);
    const widget = one(
      await db
        .insert(widgetConfigs)
        .values({
          organizationId: organization.id,
          publicKey: org.widgetKey,
          title: `${org.name} Support`,
          primaryColor: '#2563eb',
          locale: 'en-US',
        })
        .returning(),
    );
    await db.insert(widgetAllowedOrigins).values({ widgetConfigId: widget.id, origin: 'http://localhost:3002' });
    await db.insert(toolDefinitions).values([
      { organizationId: organization.id, name: 'lookup_order', enabled: true, requiresConfirmation: false, config: {} },
      { organizationId: organization.id, name: 'create_return', enabled: true, requiresConfirmation: true, config: {} },
      { organizationId: organization.id, name: 'update_shipping_address', enabled: true, requiresConfirmation: true, config: {} },
    ]);
    await db.insert(sandboxOrders).values(
      org.orders.map((order) => ({
        organizationId: organization.id,
        orderNumber: order.orderNumber,
        customerEmail: order.email,
        status: order.status,
        shippingAddress: '123 Local Development Ave',
        items: [{ sku: 'SKU-1', name: 'Seed item', quantity: 1 }],
      })),
    );
    for (const doc of org.docs) {
      const source = one(
        await db
          .insert(knowledgeSources)
          .values({ organizationId: organization.id, type: 'faq', name: doc.title, tags: doc.tags })
          .returning(),
      );
      const document = one(
        await db
          .insert(documents)
          .values({ organizationId: organization.id, sourceId: source.id, title: doc.title })
          .returning(),
      );
      const version = one(
        await db
          .insert(documentVersions)
          .values({
            organizationId: organization.id,
            documentId: document.id,
            version: 1,
            contentHash: createHash('sha256').update(doc.content).digest('hex'),
            status: 'indexed',
          })
          .returning(),
      );
      await db.insert(chunks).values({
        organizationId: organization.id,
        documentVersionId: version.id,
        chunkIndex: 0,
        title: doc.title,
        section: 'FAQ',
        url: null,
        content: doc.content,
        embedding: pseudoEmbedding(doc.content),
      });
      await db.update(knowledgeSources).set({ activeVersionId: version.id }).where(eq(knowledgeSources.id, source.id));
    }
  }
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

function one<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected database row');
  return row;
}

if (process.argv[1]?.endsWith('seed.ts') === true || process.argv[1]?.endsWith('seed.js') === true) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
