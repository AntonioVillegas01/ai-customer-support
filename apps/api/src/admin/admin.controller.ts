import { Body, Controller, Delete, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { ApiTags } from '@nestjs/swagger';
import { createApiKeyRequestSchema } from '@acs/contracts';
import { type AppConfig } from '@acs/config';
import { type AuditPort } from '@acs/application';
import { asId } from '@acs/domain';
import { apiKeys, auditEvents, conversations, promptVersions, usageRecords, widgetAllowedOrigins, widgetConfigs, type Database } from '@acs/persistence';
import { AUDIT, CONFIG, DB } from '../common/tokens';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CsrfGuard, OrgContextGuard, PermissionsGuard, RequirePermission } from '../auth/guards';
import { type RequestWithContext } from '../common/types';

@ApiTags('admin')
@UseGuards(AuthGuard, CsrfGuard, OrgContextGuard, PermissionsGuard)
@Controller('orgs/:orgId')
export class AdminController {
  constructor(@Inject(DB) private readonly db: Database, @Inject(CONFIG) private readonly config: AppConfig, @Inject(AUDIT) private readonly auditPort: AuditPort) {}

  @Post('api-keys') @RequirePermission('org:api_keys:manage')
  async createKey(@Req() req: RequestWithContext, @Param('orgId') orgId: string, @Body(new ZodValidationPipe(createApiKeyRequestSchema)) body: { name: string; scopes: string[] }): Promise<unknown> {
    const prefix = randomBytes(4).toString('hex');
    const secret = randomBytes(24).toString('base64url');
    const key = `acs_live_${prefix}_${secret}`;
    const keyHash = createHash('sha256').update(`${this.config.API_KEY_PEPPER}:${key}`).digest('hex');
    const rows = await this.db.insert(apiKeys).values({ organizationId: orgId, name: body.name, prefix, keyHash, scopes: body.scopes }).returning();
    await this.recordAudit(req, orgId, 'api_key.created', 'api_key', rows[0]?.id ?? null, { name: body.name, scopes: body.scopes });
    return { ...rows[0], key };
  }

  @Get('api-keys') @RequirePermission('org:api_keys:manage')
  async listKeys(@Param('orgId') orgId: string): Promise<unknown> {
    return this.db.select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, scopes: apiKeys.scopes, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt, createdAt: apiKeys.createdAt }).from(apiKeys).where(eq(apiKeys.organizationId, orgId));
  }

  @Delete('api-keys/:keyId') @RequirePermission('org:api_keys:manage')
  async revokeKey(@Req() req: RequestWithContext, @Param('orgId') orgId: string, @Param('keyId') keyId: string): Promise<{ ok: true }> {
    await this.db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.organizationId, orgId), eq(apiKeys.id, keyId), isNull(apiKeys.revokedAt)));
    await this.recordAudit(req, orgId, 'api_key.revoked', 'api_key', keyId, {});
    return { ok: true };
  }

  @Post('widgets') @RequirePermission('org:widget:manage')
  async createWidget(@Req() req: RequestWithContext, @Param('orgId') orgId: string, @Body() body: { title?: string; primaryColor?: string; locale?: string; origins?: string[] }): Promise<unknown> {
    const publicKey = `wpk_${randomBytes(16).toString('base64url')}`;
    const rows = await this.db.insert(widgetConfigs).values({ organizationId: orgId, publicKey, title: body.title ?? 'Support', primaryColor: body.primaryColor ?? '#111827', locale: body.locale ?? 'en' }).returning();
    const widget = rows[0];
    if (widget !== undefined && Array.isArray(body.origins)) await this.db.insert(widgetAllowedOrigins).values(body.origins.map((origin) => ({ widgetConfigId: widget.id, origin }))).onConflictDoNothing();
    await this.recordAudit(req, orgId, 'widget.created', 'widget_config', widget?.id ?? null, { origins: body.origins ?? [] });
    return widget;
  }

  @Get('audit') @RequirePermission('audit:read')
  async audit(@Param('orgId') orgId: string): Promise<unknown> {
    return this.db.select().from(auditEvents).where(eq(auditEvents.organizationId, orgId)).orderBy(desc(auditEvents.occurredAt)).limit(100);
  }

  @Get('prompts') @RequirePermission('org:settings:read')
  async prompts(): Promise<unknown> { return this.db.select().from(promptVersions).orderBy(desc(promptVersions.createdAt)); }

  @Get('usage') @RequirePermission('analytics:read')
  async usage(@Param('orgId') orgId: string): Promise<unknown> {
    const periodMonth = new Date().toISOString().slice(0, 7);
    const usageRows = await this.db.select().from(usageRecords).where(and(eq(usageRecords.organizationId, orgId), eq(usageRecords.periodMonth, periodMonth))).limit(1);
    const [conversationTotals] = await this.db
      .select({
        conversations: count(),
        escalated: sql<number>`count(*) filter (where ${conversations.escalationReasonCode} is not null)`,
      })
      .from(conversations)
      .where(and(eq(conversations.organizationId, orgId), sql`to_char(${conversations.createdAt}, 'YYYY-MM') = ${periodMonth}`));
    const totalConversations = Number(conversationTotals?.conversations ?? 0);
    const escalated = Number(conversationTotals?.escalated ?? 0);
    return {
      periodMonth,
      aiCostUsd: Number(usageRows[0]?.aiCostUsd ?? 0),
      tokens: usageRows[0]?.tokens ?? 0,
      conversations: totalConversations,
      escalationRate: totalConversations === 0 ? 0 : escalated / totalConversations,
    };
  }

  private async recordAudit(req: RequestWithContext, orgId: string, action: string, resourceType: string, resourceId: string | null, metadata: Record<string, unknown>): Promise<void> {
    await this.auditPort.record({
      organizationId: asId<'OrganizationId'>(orgId),
      actorType: 'user',
      actorId: req.context?.auth?.userId ?? null,
      action,
      resourceType,
      resourceId: resourceId ?? 'unknown',
      metadata,
      occurredAt: new Date(),
    });
  }
}
