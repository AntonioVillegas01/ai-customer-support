import { Body, Controller, Delete, Get, Inject, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { ApiTags } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import { type JobQueuePort, type ObjectStoragePort, type RetrievalPort } from '@acs/application';
import { asId } from '@acs/domain';
import { createFaqRequestSchema, createUrlSourceRequestSchema } from '@acs/contracts';
import { documents, documentVersions, ingestionJobs, knowledgeSources, chunks, type Database } from '@acs/persistence';
import { AuthGuard, CsrfGuard, OrgContextGuard, PermissionsGuard, RequirePermission } from '../auth/guards';
import { CONFIG, DB, QUEUE, STORAGE } from '../common/tokens';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { StableHttpError } from '../common/auth-errors';
import { type AppConfig } from '@acs/config';

interface UploadedMemoryFile { buffer: Buffer; originalname: string; mimetype: string; size: number; }

@ApiTags('knowledge')
@UseGuards(AuthGuard, CsrfGuard, OrgContextGuard, PermissionsGuard)
@Controller('orgs/:orgId/knowledge')
export class KnowledgeController {
  constructor(@Inject(DB) private readonly db: Database, @Inject(QUEUE) private readonly queue: JobQueuePort, @Inject('RETRIEVAL') private readonly retrieval: RetrievalPort, @Inject(STORAGE) private readonly storage: ObjectStoragePort, @Inject(CONFIG) private readonly config: AppConfig) {}

  @Post('sources/faq') @RequirePermission('knowledge:write')
  async faq(@Param('orgId') orgId: string, @Body(new ZodValidationPipe(createFaqRequestSchema)) body: { question: string; answer: string; tags: string[] }): Promise<unknown> {
    const content = `# ${body.question}\n\n${body.answer}`;
    return this.createStoredSource(orgId, 'faq', body.question, body.tags, Buffer.from(content, 'utf8'), 'text/markdown');
  }

  @Post('sources/url') @RequirePermission('knowledge:write')
  async url(@Param('orgId') orgId: string, @Body(new ZodValidationPipe(createUrlSourceRequestSchema)) body: { url: string; tags: string[] }): Promise<unknown> {
    assertSafeHttpsUrl(body.url);
    const response = await fetch(body.url, { redirect: 'error' });
    if (!response.ok) throw new StableHttpError('URL_NOT_ALLOWED', 'URL could not be fetched');
    const text = await response.text();
    return this.createStoredSource(orgId, 'url', body.url, body.tags, Buffer.from(text, 'utf8'), response.headers.get('content-type') ?? 'text/html');
  }

  @Post('sources/file') @UseInterceptors(FileInterceptor('file')) @RequirePermission('knowledge:write')
  async file(@Param('orgId') orgId: string, @UploadedFile() file: UploadedMemoryFile | undefined, @Body() body: { tags?: string[] }): Promise<unknown> {
    if (file === undefined) throw new StableHttpError('VALIDATION_FAILED', 'file is required');
    if (!allowedMagic(file.buffer, file.originalname)) throw new StableHttpError('UNSUPPORTED_FILE_TYPE', 'Unsupported file type');
    return this.createStoredSource(orgId, 'file', file.originalname, body.tags ?? [], file.buffer, file.mimetype);
  }

  @Get('sources') @RequirePermission('knowledge:read')
  async sources(@Param('orgId') orgId: string): Promise<unknown> {
    return this.db.select().from(knowledgeSources).where(and(eq(knowledgeSources.organizationId, orgId), isNull(knowledgeSources.deletedAt))).orderBy(desc(knowledgeSources.createdAt));
  }

  @Post('sources/:id/reprocess') @RequirePermission('knowledge:write')
  async reprocess(@Param('orgId') orgId: string, @Param('id') sourceId: string): Promise<unknown> {
    const source = (await this.db.select().from(knowledgeSources).where(and(eq(knowledgeSources.organizationId, orgId), eq(knowledgeSources.id, sourceId), isNull(knowledgeSources.deletedAt))).limit(1))[0];
    if (source === undefined) throw new StableHttpError('NOT_FOUND', 'Source not found');
    if (source.activeVersionId === null) throw new StableHttpError('VALIDATION_FAILED', 'Source has no active document version to reprocess');
    // Reset version status so the worker re-extracts and re-embeds instead of short-circuiting on the indexed-hash dedupe check.
    await this.db.update(documentVersions).set({ status: 'processing', error: null }).where(and(eq(documentVersions.organizationId, orgId), eq(documentVersions.id, source.activeVersionId)));
    const job = await this.db.insert(ingestionJobs).values({ organizationId: orgId, sourceId, documentVersionId: source.activeVersionId, status: 'pending' }).returning();
    const jobId = job[0]?.id;
    if (jobId !== undefined) await this.queue.enqueueIngestion({ organizationId: asId<'OrganizationId'>(orgId), sourceId, ingestionJobId: jobId, dedupeKey: `ingest:${jobId}` });
    return job[0];
  }

  @Delete('sources/:id') @RequirePermission('knowledge:write')
  async remove(@Param('orgId') orgId: string, @Param('id') id: string): Promise<{ ok: true }> {
    await this.db.update(knowledgeSources).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(knowledgeSources.organizationId, orgId), eq(knowledgeSources.id, id)));
    await this.db.delete(chunks).where(eq(chunks.organizationId, orgId));
    return { ok: true };
  }

  @Get('search') @RequirePermission('knowledge:read')
  async search(@Param('orgId') orgId: string, @Query('q') q: string | undefined): Promise<unknown> {
    return this.retrieval.search({ organizationId: asId<'OrganizationId'>(orgId), query: q ?? '', limit: 10, minScore: 0 });
  }

  private async createStoredSource(orgId: string, type: 'file' | 'url' | 'faq', name: string, tags: string[], body: Buffer, _contentType: string): Promise<unknown> {
    const hash = createHash('sha256').update(body).digest('hex');
    const storageKey = `org/${orgId}/knowledge/${hash}`;
    await this.storage.put(this.config.S3_BUCKET_KNOWLEDGE, storageKey, body, _contentType);
    const rows = await this.db.transaction(async (tx) => {
      const sourceRows = await tx.insert(knowledgeSources).values({ organizationId: orgId, type, name, tags }).returning();
      const source = sourceRows[0];
      if (source === undefined) throw new StableHttpError('CONFLICT', 'Source was not created');
      const documentRows = await tx.insert(documents).values({ organizationId: orgId, sourceId: source.id, title: name }).returning();
      const document = documentRows[0];
      if (document === undefined) throw new StableHttpError('CONFLICT', 'Document was not created');
      const versionRows = await tx.insert(documentVersions).values({ organizationId: orgId, documentId: document.id, version: 1, contentHash: hash, status: 'pending', storageKey }).returning();
      const version = versionRows[0];
      if (version === undefined) throw new StableHttpError('CONFLICT', 'Version was not created');
      const jobRows = await tx.insert(ingestionJobs).values({ organizationId: orgId, sourceId: source.id, documentVersionId: version.id, status: 'pending' }).returning();
      return { source, document, version, job: jobRows[0] };
    });
    if (rows.job !== undefined) await this.queue.enqueueIngestion({ organizationId: asId<'OrganizationId'>(orgId), sourceId: rows.source.id, ingestionJobId: rows.job.id, dedupeKey: `ingest:${rows.job.id}` });
    return rows;
  }
}

function allowedMagic(buffer: Buffer, name: string): boolean {
  const lower = name.toLowerCase();
  if (buffer.subarray(0, 4).toString('latin1') === '%PDF') return true;
  if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.html')) return buffer.includes(0) === false;
  return false;
}
function assertSafeHttpsUrl(raw: string): void { const url = new URL(raw); if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)) throw new StableHttpError('URL_NOT_ALLOWED', 'Only public HTTPS URLs are allowed'); }
