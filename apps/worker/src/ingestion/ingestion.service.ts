import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import pdf from 'pdf-parse';
import sanitizeHtml from 'sanitize-html';
import { htmlToText } from 'html-to-text';
import { franc } from 'franc-min';
import { and, eq } from 'drizzle-orm';
import { type EmbeddingProviderPort, type ObjectStoragePort } from '@acs/application';
import { chunks, documentVersions, ingestionJobs, knowledgeSources, type Database } from '@acs/persistence';
import { type AppConfig } from '@acs/config';

export class IngestionService {
  constructor(private readonly db: Database, private readonly storage: ObjectStoragePort, private readonly embeddings: EmbeddingProviderPort, private readonly config: AppConfig) {}

  async process(input: { organizationId: string; sourceId: string; ingestionJobId: string }): Promise<void> {
    await this.stage(input.ingestionJobId, 'processing', 10, null);
    const job = (await this.db.select().from(ingestionJobs).where(and(eq(ingestionJobs.organizationId, input.organizationId), eq(ingestionJobs.id, input.ingestionJobId))).limit(1))[0];
    if (job?.documentVersionId === null || job?.documentVersionId === undefined) throw new Error('ingestion job missing document version');
    const version = (await this.db.select().from(documentVersions).where(and(eq(documentVersions.organizationId, input.organizationId), eq(documentVersions.id, job.documentVersionId))).limit(1))[0];
    if (version?.storageKey === null || version?.storageKey === undefined) throw new Error('document version missing storage key');
    const existing = await this.db.select({ id: documentVersions.id }).from(documentVersions).where(and(eq(documentVersions.organizationId, input.organizationId), eq(documentVersions.documentId, version.documentId), eq(documentVersions.contentHash, version.contentHash), eq(documentVersions.status, 'indexed'))).limit(1);
    if (existing[0] !== undefined) { await this.activate(input, version.id); return; }
    const object = await this.storage.get(this.config.S3_BUCKET_KNOWLEDGE, version.storageKey);
    const computedHash = createHash('sha256').update(object).digest('hex');
    if (computedHash !== version.contentHash) throw new Error('content hash mismatch');
    await this.stage(input.ingestionJobId, 'processing', 35, null);
    const text = await extractText(object, version.storageKey);
    const language = franc(text.slice(0, 5000));
    const parts = chunkText(text, 1200, 150);
    await this.stage(input.ingestionJobId, 'processing', 65, null);
    const embedded = await this.embeddings.embed(parts.map((p) => p.content), this.config.AI_MODEL_EMBEDDING);
    await this.db.transaction(async (tx) => {
      await tx.delete(chunks).where(and(eq(chunks.organizationId, input.organizationId), eq(chunks.documentVersionId, version.id)));
      if (parts.length > 0) {
        await tx.insert(chunks).values(parts.map((part, index) => ({ organizationId: input.organizationId, documentVersionId: version.id, chunkIndex: index, title: part.title, section: language === 'und' ? null : language, content: part.content, embedding: embedded.vectors[index] })));
      }
      await tx.update(documentVersions).set({ status: 'indexed', error: null }).where(and(eq(documentVersions.organizationId, input.organizationId), eq(documentVersions.id, version.id)));
      await tx.update(knowledgeSources).set({ activeVersionId: version.id, updatedAt: new Date() }).where(and(eq(knowledgeSources.organizationId, input.organizationId), eq(knowledgeSources.id, input.sourceId)));
      await tx.update(ingestionJobs).set({ status: 'indexed', progress: 100, error: null, finishedAt: new Date() }).where(and(eq(ingestionJobs.organizationId, input.organizationId), eq(ingestionJobs.id, input.ingestionJobId)));
    });
  }

  async fail(input: { organizationId: string; ingestionJobId: string }, error: string): Promise<void> { await this.stage(input.ingestionJobId, 'failed', 100, error); }
  private async activate(input: { organizationId: string; sourceId: string; ingestionJobId: string }, versionId: string): Promise<void> { await this.db.transaction(async (tx) => { await tx.update(knowledgeSources).set({ activeVersionId: versionId, updatedAt: new Date() }).where(and(eq(knowledgeSources.organizationId, input.organizationId), eq(knowledgeSources.id, input.sourceId))); await tx.update(ingestionJobs).set({ status: 'indexed', progress: 100, finishedAt: new Date() }).where(and(eq(ingestionJobs.organizationId, input.organizationId), eq(ingestionJobs.id, input.ingestionJobId))); }); }
  private async stage(jobId: string, status: 'processing' | 'indexed' | 'failed', progress: number, error: string | null): Promise<void> { await this.db.update(ingestionJobs).set({ status, progress, error, startedAt: status === 'processing' ? new Date() : undefined, finishedAt: status === 'failed' || status === 'indexed' ? new Date() : undefined }).where(eq(ingestionJobs.id, jobId)); }
}

export async function extractText(buffer: Buffer, key: string): Promise<string> {
  const ext = extname(key).toLowerCase();
  if (ext === '.pdf') return (await pdf(buffer)).text;
  const raw = buffer.toString('utf8');
  if (ext === '.html' || raw.trimStart().startsWith('<')) return htmlToText(sanitizeHtml(raw), { wordwrap: false });
  if (ext === '.docx') throw new Error('KNOWLEDGE_UNSUPPORTED_FORMAT');
  return raw.replace(/^#{1,6}\s+/gm, '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
}

export function chunkText(text: string, size: number, overlap: number): { title: string; content: string }[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return [];
  const chunksOut: { title: string; content: string }[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + size);
    chunksOut.push({ title: normalized.slice(0, 80), content: normalized.slice(start, end) });
    if (end === normalized.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunksOut;
}
