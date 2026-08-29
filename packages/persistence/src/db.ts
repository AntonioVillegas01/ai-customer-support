import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbClient = Database | Transaction;

export function createDb(config: { databaseUrl: string; poolMax: number }): { db: Database; pool: Pool } {
  const pool = new Pool({ connectionString: config.databaseUrl, max: config.poolMax });
  return { db: drizzle(pool, { schema }), pool };
}

export async function closeDb(pool: Pool): Promise<void> {
  await pool.end();
}
