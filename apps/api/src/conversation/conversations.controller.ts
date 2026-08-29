import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { type Response } from 'express';
import { and, desc, eq, lt } from 'drizzle-orm';
import Redis from 'ioredis';
import { ApiTags } from '@nestjs/swagger';
import { PostCustomerMessageUseCase, type UnitOfWork, type JobQueuePort, type ConversationEventPublisher, type RateLimiterPort } from '@acs/application';
import { asId, Conversation } from '@acs/domain';
import { cursorPaginationQuerySchema, postMessageRequestSchema } from '@acs/contracts';
import { conversations, customers, internalNotes, messages, type Database } from '@acs/persistence';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { type RequestWithContext } from '../common/types';
import { StableHttpError } from '../common/auth-errors';
import { AuthGuard, CsrfGuard, OrgContextGuard, PermissionsGuard, RequirePermission } from '../auth/guards';
import { WidgetTokenGuard } from '../widget/widget.guard';
import { DB, EVENTS, QUEUE, RATE_LIMITER, REDIS, UOW } from '../common/tokens';

@ApiTags('widget conversations')
@Controller('widget/conversations')
export class WidgetConversationsController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(UOW) private readonly uow: UnitOfWork,
    @Inject(QUEUE) private readonly queue: JobQueuePort,
    @Inject(EVENTS) private readonly events: ConversationEventPublisher,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiterPort,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @UseGuards(WidgetTokenGuard)
  @Post()
  async create(@Req() req: RequestWithContext, @Body() body: { subject?: string; customer?: { email?: string; name?: string } }): Promise<unknown> {
    const widget = requireWidget(req);
    const now = new Date();
    let customerId = widget.customerId;
    if (customerId === null) {
      const created = await this.db.insert(customers).values({ organizationId: widget.organizationId, email: body.customer?.email, name: body.customer?.name }).returning({ id: customers.id });
      customerId = created[0]?.id ?? null;
    }
    const conversation = Conversation.start({ id: asId<'ConversationId'>(crypto.randomUUID()), organizationId: asId<'OrganizationId'>(widget.organizationId), customerId: customerId === null ? null : asId<'CustomerId'>(customerId), subject: body.subject ?? null, now });
    const props = conversation.toProps();
    await this.db.insert(conversations).values({ id: props.id, organizationId: props.organizationId, customerId: props.customerId, status: props.status, priority: props.priority, subject: props.subject, createdAt: now, updatedAt: now });
    return props;
  }

  @UseGuards(WidgetTokenGuard)
  @Post(':id/messages')
  async postMessage(@Req() req: RequestWithContext, @Param('id') id: string, @Body(new ZodValidationPipe(postMessageRequestSchema)) body: { content: string; idempotencyKey: string }): Promise<unknown> {
    const widget = requireWidget(req);
    const useCase = new PostCustomerMessageUseCase(this.uow, this.queue, this.events, this.limiter, { now: () => new Date() }, { uuid: () => crypto.randomUUID() });
    const result = await useCase.execute({ organizationId: asId<'OrganizationId'>(widget.organizationId), conversationId: asId<'ConversationId'>(id), customerId: widget.customerId, content: body.content, idempotencyKey: body.idempotencyKey });
    return { accepted: true, duplicate: result.duplicate, aiProcessingEnqueued: result.aiProcessingEnqueued, message: result.message };
  }

  @UseGuards(WidgetTokenGuard)
  @Get(':id/messages')
  async listMessages(@Req() req: RequestWithContext, @Param('id') id: string, @Query(new ZodValidationPipe(cursorPaginationQuerySchema)) query: { cursor?: string; limit: number }): Promise<unknown> {
    const widget = requireWidget(req);
    return listMessages(this.db, widget.organizationId, id, query.limit, query.cursor);
  }

  @UseGuards(WidgetTokenGuard)
  @Get(':id/events')
  async eventsStream(@Req() req: RequestWithContext, @Param('id') id: string, @Res() res: Response): Promise<void> {
    const widget = requireWidget(req);
    await streamRedis(this.redis, `org:${widget.organizationId}:conversation:${id}`, res);
  }
}

@ApiTags('staff conversations')
@UseGuards(AuthGuard, CsrfGuard, OrgContextGuard, PermissionsGuard)
@Controller('orgs/:orgId/conversations')
export class StaffConversationsController {
  constructor(@Inject(DB) private readonly db: Database, @Inject(REDIS) private readonly redis: Redis) {}

  @Get() @RequirePermission('conversations:read')
  async list(@Param('orgId') orgId: string, @Query(new ZodValidationPipe(cursorPaginationQuerySchema)) query: { cursor?: string; limit: number }): Promise<unknown> {
    const decoded = decodeCursor(query.cursor);
    const where = decoded === null ? eq(conversations.organizationId, orgId) : and(eq(conversations.organizationId, orgId), lt(conversations.createdAt, decoded));
    const rows = await this.db.select().from(conversations).where(where).orderBy(desc(conversations.createdAt)).limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    return { items: page.map(serializeConversation), nextCursor: rows.length > query.limit ? encodeCursor(page[page.length - 1]?.createdAt) : null };
  }

  @Get(':id') @RequirePermission('conversations:read')
  async detail(@Param('orgId') orgId: string, @Param('id') id: string): Promise<unknown> {
    const convo = (await this.db.select().from(conversations).where(and(eq(conversations.organizationId, orgId), eq(conversations.id, id))).limit(1))[0];
    if (convo === undefined) throw new StableHttpError('NOT_FOUND', 'Conversation not found');
    return { conversation: serializeConversation(convo), messages: await listMessages(this.db, orgId, id, 100), notes: await this.db.select().from(internalNotes).where(and(eq(internalNotes.organizationId, orgId), eq(internalNotes.conversationId, id))).orderBy(desc(internalNotes.createdAt)) };
  }

  @Post(':id/status') @RequirePermission('conversations:manage')
  async status(@Param('orgId') orgId: string, @Param('id') id: string, @Body() body: { status: string }): Promise<unknown> {
    const row = (await this.db.select().from(conversations).where(and(eq(conversations.organizationId, orgId), eq(conversations.id, id))).limit(1))[0];
    if (row === undefined) throw new StableHttpError('NOT_FOUND', 'Conversation not found');
    const aggregate = Conversation.fromProps({ id: asId<'ConversationId'>(row.id), organizationId: asId<'OrganizationId'>(row.organizationId), customerId: row.customerId === null ? null : asId<'CustomerId'>(row.customerId), status: row.status as ReturnType<Conversation['toProps']>['status'], priority: row.priority as ReturnType<Conversation['toProps']>['priority'], subject: row.subject, assignedAgentId: row.assignedAgentId === null ? null : asId<'UserId'>(row.assignedAgentId), escalationReasonCode: row.escalationReasonCode, language: row.language, intent: row.intent, sentiment: row.sentiment, urgency: row.urgency, tags: row.tags, lastMessageAt: row.lastMessageAt, firstResponseAt: row.firstResponseAt, resolvedAt: row.resolvedAt, createdAt: row.createdAt, updatedAt: row.updatedAt });
    aggregate.transitionTo(body.status as ReturnType<Conversation['toProps']>['status'], new Date());
    const props = aggregate.toProps();
    await this.db.update(conversations).set({ status: props.status, resolvedAt: props.resolvedAt, updatedAt: props.updatedAt }).where(and(eq(conversations.organizationId, orgId), eq(conversations.id, id)));
    return props;
  }

  @Post(':id/messages') @RequirePermission('conversations:respond')
  async agentMessage(@Req() req: RequestWithContext, @Param('orgId') orgId: string, @Param('id') id: string, @Body() body: { content: string }): Promise<unknown> {
    const userId = req.context?.auth?.userId;
    if (userId === undefined) throw new StableHttpError('UNAUTHENTICATED', 'Authentication required');
    const inserted = await this.db.insert(messages).values({ organizationId: orgId, conversationId: id, role: 'agent', content: body.content, processingState: 'delivered', aiGenerated: false, idempotencyKey: `agent:${crypto.randomUUID()}` }).returning();
    await this.db.update(conversations).set({ status: 'assigned_human', assignedAgentId: userId, updatedAt: new Date(), lastMessageAt: new Date() }).where(and(eq(conversations.organizationId, orgId), eq(conversations.id, id)));
    return inserted[0];
  }

  @Post(':id/notes') @RequirePermission('conversations:respond')
  async note(@Req() req: RequestWithContext, @Param('orgId') orgId: string, @Param('id') id: string, @Body() body: { content: string }): Promise<unknown> {
    const userId = req.context?.auth?.userId;
    if (userId === undefined) throw new StableHttpError('UNAUTHENTICATED', 'Authentication required');
    const rows = await this.db.insert(internalNotes).values({ organizationId: orgId, conversationId: id, authorId: userId, content: body.content }).returning();
    return rows[0];
  }

  @Get(':id/events') @RequirePermission('conversations:read')
  async staffEvents(@Param('orgId') orgId: string, @Param('id') id: string, @Res() res: Response): Promise<void> { await streamRedis(this.redis, `org:${orgId}:conversation:${id}`, res); }
}

type MessageRow = typeof messages.$inferSelect;
type ConversationRow = typeof conversations.$inferSelect;

async function listMessages(db: Database, orgId: string, conversationId: string, limit: number, cursor?: string): Promise<unknown> {
  const decoded = decodeCursor(cursor);
  const where = decoded === null ? and(eq(messages.organizationId, orgId), eq(messages.conversationId, conversationId)) : and(eq(messages.organizationId, orgId), eq(messages.conversationId, conversationId), lt(messages.createdAt, decoded));
  const rows = await db.select().from(messages).where(where).orderBy(desc(messages.createdAt)).limit(limit + 1);
  const page = rows.slice(0, limit);
  return { items: page.reverse().map(serializeMessageRow), nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]?.createdAt) : null };
}

function serializeMessageRow(row: MessageRow): unknown { return { ...row, createdAt: row.createdAt.toISOString() }; }
function serializeConversation(row: ConversationRow): unknown { return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), lastMessageAt: row.lastMessageAt?.toISOString() ?? null, firstResponseAt: row.firstResponseAt?.toISOString() ?? null, resolvedAt: row.resolvedAt?.toISOString() ?? null }; }
function encodeCursor(date: Date | undefined): string | null { return date === undefined ? null : Buffer.from(date.toISOString(), 'utf8').toString('base64url'); }
function decodeCursor(cursor: string | undefined): Date | null { if (cursor === undefined) return null; const date = new Date(Buffer.from(cursor, 'base64url').toString('utf8')); return Number.isNaN(date.getTime()) ? null : date; }
function requireWidget(req: RequestWithContext): { organizationId: string; widgetConfigId: string; customerId: string | null } { const widget = req.context?.widget; if (widget === undefined) throw new StableHttpError('INVALID_WIDGET_TOKEN', 'Widget token required'); return widget; }
async function streamRedis(redis: Redis, channel: string, res: Response): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.flushHeaders();
  const sub = redis.duplicate(); await sub.subscribe(channel);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);
  sub.on('message', (_channel: string, payload: string) => { const parsed = safeJson(payload); const id = typeof parsed.id === 'string' ? parsed.id : crypto.randomUUID(); res.write(`id: ${id}\nevent: message\ndata: ${JSON.stringify(parsed.event ?? parsed)}\n\n`); });
  res.on('close', () => { clearInterval(heartbeat); void sub.unsubscribe(channel).finally(() => sub.disconnect()); });
}
function safeJson(payload: string): Record<string, unknown> { try { const p: unknown = JSON.parse(payload); return typeof p === 'object' && p !== null ? p as Record<string, unknown> : {}; } catch { return {}; } }
