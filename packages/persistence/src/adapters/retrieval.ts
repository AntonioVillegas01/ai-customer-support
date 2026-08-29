import { sql } from 'drizzle-orm';
import {
  type EmbeddingProviderPort,
  type RetrievalPort,
  type RetrievedChunk,
} from '@acs/application';
import { type OrganizationId } from '@acs/domain';
import { type DbClient } from '../db';

interface HybridRow extends Record<string, unknown> {
  chunk_id: string;
  document_id: string;
  document_version_id: string;
  title: string;
  section: string | null;
  url: string | null;
  content: string;
  score: string | number;
}

interface QueryResult<T> {
  rows: T[];
}

export class HybridRetrievalAdapter implements RetrievalPort {
  constructor(
    private readonly db: DbClient,
    private readonly embeddings: EmbeddingProviderPort,
    private readonly embeddingModel = 'openai/text-embedding-3-small',
  ) {}

  async search(input: {
    organizationId: OrganizationId;
    query: string;
    limit: number;
    minScore: number;
    tags?: string[];
  }): Promise<RetrievedChunk[]> {
    const embedded = await this.embeddings.embed([input.query], this.embeddingModel);
    const queryEmbedding = embedded.vectors[0];
    if (queryEmbedding === undefined) return [];
    const vectorLiteral = `[${queryEmbedding.map((value) => value.toString()).join(',')}]`;
    const tags = input.tags ?? [];
    const tagFilter = tags.length > 0 ? sql`and ks.tags && ${tags}::text[]` : sql``;
    const maxCandidates = Math.max(input.limit * 5, 20);
    const result = await this.db.execute<HybridRow>(sql`
      with eligible as (
        select
          c.id as chunk_id,
          d.id as document_id,
          dv.id as document_version_id,
          c.title,
          c.section,
          c.url,
          c.content,
          c.content_tsv,
          c.embedding
        from chunks c
        join document_versions dv
          on dv.id = c.document_version_id
          and dv.organization_id = c.organization_id
          and dv.status = 'indexed'
        join documents d
          on d.id = dv.document_id
          and d.organization_id = c.organization_id
        join knowledge_sources ks
          on ks.id = d.source_id
          and ks.organization_id = c.organization_id
          and ks.active_version_id = dv.id
          and ks.deleted_at is null
        where c.organization_id = ${input.organizationId}
        ${tagFilter}
      ),
      fts as (
        select
          chunk_id,
          document_id,
          document_version_id,
          title,
          section,
          url,
          content,
          row_number() over (order by ts_rank(content_tsv, plainto_tsquery('english', ${input.query})) desc) as rank
        from eligible
        where content_tsv @@ plainto_tsquery('english', ${input.query})
        order by ts_rank(content_tsv, plainto_tsquery('english', ${input.query})) desc
        limit ${maxCandidates}
      ),
      vec as (
        select
          chunk_id,
          document_id,
          document_version_id,
          title,
          section,
          url,
          content,
          row_number() over (order by embedding <=> ${vectorLiteral}::vector asc) as rank
        from eligible
        where embedding is not null
        order by embedding <=> ${vectorLiteral}::vector asc
        limit ${maxCandidates}
      ),
      fused as (
        select chunk_id, document_id, document_version_id, title, section, url, content, (1.0 / (60 + rank)) as score from fts
        union all
        select chunk_id, document_id, document_version_id, title, section, url, content, (1.0 / (60 + rank)) as score from vec
      )
      select
        chunk_id,
        document_id,
        document_version_id,
        title,
        section,
        url,
        content,
        least(sum(score) / (2.0 / 61.0), 1.0) as score
      from fused
      group by chunk_id, document_id, document_version_id, title, section, url, content
      having least(sum(score) / (2.0 / 61.0), 1.0) >= ${input.minScore}
      order by score desc
      limit ${input.limit}
    `);
    return rowsFromResult<HybridRow>(result).map((row) => ({
      chunkId: row.chunk_id,
      documentId: row.document_id,
      documentVersionId: row.document_version_id,
      title: row.title,
      section: row.section,
      url: row.url,
      content: row.content,
      score: typeof row.score === 'number' ? row.score : Number(row.score),
    }));
  }
}

function rowsFromResult<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (typeof result === 'object' && result !== null && 'rows' in result) {
    return (result as QueryResult<T>).rows;
  }
  return [];
}
