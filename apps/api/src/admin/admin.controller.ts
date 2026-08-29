import { Body, Controller, Delete, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { ApiTags } from '@nestjs/swagger';
import { createApiKeyRequestSchema } from '@acs/contracts';
import { type AppConfig } from '@acs/config';
import { apiKeys, auditEvents, promptVersions, widgetAllowedOrigins, widgetConfigs, type Database } from '@acs/persistence';
import { CONFIG, DB } from '../common/tokens';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthGuard, CsrfGuard, OrgContextGuard, PermissionsGuard, RequirePermission } from '../auth/guards';

@ApiTags('admin')
@UseGuards(AuthGuard, CsrfGuard, OrgContextGuard, PermissionsGuard)
@Controller('orgs/:orgId')
export class AdminController {
  constructor(@Inject(DB) private readonly db: Database, @Inject(CONFIG) private readonly config: AppConfig) {}

  @Post('api-keys') @RequirePermission('org:api_keys:manage')
  async createKey(@Param('orgId') orgId: string, @Body(new ZodValidationPipe(createApiKeyRequestSchema)) body: { name: string; scopes: string[] }): Promise<unknown> {
    const prefix = randomBytes(4).toString('hex');
    const secret = randomBytes(24).toString('base64url');
    const key = `acs_live_${prefix}_${secret}`;
    const keyHash = createHash('sha256').update(`${this.config.API_KEY_PEPPER}:${key}`).digest('hex');
    const rows = await this.db.insert(apiKeys).values({ organizationId: orgId, name: body.name, prefix, keyHash, scopes: body.scopes }).returning();
    return { ...rows[0], key };
  }

  @Get('api-keys') @RequirePermission('org:api_keys:manage')
  async listKeys(@Param('orgId') orgId: string): Promise<unknown> {
    return this.db.select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, scopes: apiKeys.scopes, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt, createdAt: apiKeys.createdAt }).from(apiKeys).where(eq(apiKeys.organizationId, orgId));
  }

  @Delete('api-keys/:keyId') @RequirePermission('org:api_keys:manage')
  async revokeKey(@Param('orgId') orgId: string, @Param('keyId') keyId: string): Promise<{ ok: true }> {
    await this.db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.organizationId, orgId), eq(apiKeys.id, keyId), isNull(apiKeys.revokedAt)));
    return { ok: true };
  }

  @Post('widgets') @RequirePermission('org:widget:manage')
  async createWidget(@Param('orgId') orgId: string, @Body() body: { title?: string; primaryColor?: string; locale?: string; origins?: string[] }): Promise<unknown> {
    const publicKey = `wpk_${randomBytes(16).toString('base64url')}`;
    const rows = await this.db.insert(widgetConfigs).values({ organizationId: orgId, publicKey, title: body.title ?? 'Support', primaryColor: body.primaryColor ?? '#111827', locale: body.locale ?? 'en' }).returning();
    const widget = rows[0];
    if (widget !== undefined && Array.isArray(body.origins)) await this.db.insert(widgetAllowedOrigins).values(body.origins.map((origin) => ({ widgetConfigId: widget.id, origin }))).onConflictDoNothing();
    return widget;
  }

  @Get('audit') @RequirePermission('audit:read')
  async audit(@Param('orgId') orgId: string): Promise<unknown> {
    return this.db.select().from(auditEvents).where(eq(auditEvents.organizationId, orgId)).orderBy(desc(auditEvents.occurredAt)).limit(100);
  }

  @Get('prompts') @RequirePermission('org:settings:read')
  async prompts(): Promise<unknown> { return this.db.select().from(promptVersions).orderBy(desc(promptVersions.createdAt)); }
}
