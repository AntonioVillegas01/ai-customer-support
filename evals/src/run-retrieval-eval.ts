import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { asId } from '@acs/domain';
import { FakeEmbeddingProvider } from '@acs/testing';
import { createDb, closeDb, HybridRetrievalAdapter, organizations } from '@acs/persistence';
import { z } from 'zod';
import { aggregate, scoreCase, type CaseMetrics } from './metrics';

/**
 * Offline retrieval evaluation against the locally seeded database.
 * Requires: docker compose postgres up, migrations + seed applied.
 * Uses the deterministic fake embedding provider (1536 dims), matching how the
 * seed corpus was embedded, so vector and FTS branches are both exercised.
 *
 * Regression thresholds (CI quality gate): recall@5 >= 0.85, MRR >= 0.6.
 */
const datasetSchema = z.object({
  version: z.string(),
  cases: z.array(
    z.object({
      id: z.string(),
      orgSlug: z.string(),
      query: z.string(),
      expectedTitles: z.array(z.string()).min(1),
    }),
  ),
});

const K = 5;
const RECALL_THRESHOLD = 0.85;
const MRR_THRESHOLD = 0.6;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? 'postgres://acs:acs_local_dev@localhost:5433/acs';
  const raw = await readFile(join(process.cwd(), 'datasets', 'golden-retrieval.v1.json'), 'utf8');
  const dataset = datasetSchema.parse(JSON.parse(raw));

  const { db, pool } = createDb({ databaseUrl, poolMax: 4 });
  const retrieval = new HybridRetrievalAdapter(db, new FakeEmbeddingProvider(1536));
  const results: CaseMetrics[] = [];
  try {
    const orgRows = await db.select({ id: organizations.id, slug: organizations.slug }).from(organizations);
    const orgBySlug = new Map(orgRows.map((row) => [row.slug, row.id]));
    for (const evalCase of dataset.cases) {
      const orgId = orgBySlug.get(evalCase.orgSlug);
      if (orgId === undefined) throw new Error(`Organization not seeded: ${evalCase.orgSlug}`);
      const retrieved = await retrieval.search({
        organizationId: asId<'OrganizationId'>(orgId),
        query: evalCase.query,
        limit: K,
        minScore: 0,
      });

      results.push(
        scoreCase({
          id: evalCase.id,
          expectedTitles: evalCase.expectedTitles,
          retrieved: retrieved.map((r) => ({ title: r.title, score: r.score })),
          k: K,
        }),
      );
    }
  } finally {
    await closeDb(pool);
  }

  const summary = aggregate(results);
  const lines = [
    `retrieval eval — dataset ${dataset.version}, K=${K}, cases=${results.length}`,
    `recall@${K}:    ${summary.recallAtK.toFixed(3)} (threshold ${RECALL_THRESHOLD})`,
    `precision@${K}: ${summary.precisionAtK.toFixed(3)}`,
    `MRR:          ${summary.mrr.toFixed(3)} (threshold ${MRR_THRESHOLD})`,
    ...summary.cases.map(
      (c) => `  ${c.reciprocalRank > 0 ? 'PASS' : 'MISS'} ${c.id} rr=${c.reciprocalRank.toFixed(2)} got=[${c.retrievedTitles.join(', ')}]`,
    ),
  ];
  console.error(lines.join('\n'));

  if (summary.recallAtK < RECALL_THRESHOLD || summary.mrr < MRR_THRESHOLD) {
    console.error('FAIL: retrieval quality below regression thresholds');
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
