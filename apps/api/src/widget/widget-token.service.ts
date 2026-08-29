import { createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { type AppConfig } from '@acs/config';
import { customers, widgetAllowedOrigins, widgetConfigs, type Database } from '@acs/persistence';
import { CONFIG, DB } from '../common/tokens';
import { StableHttpError } from '../common/auth-errors';

export interface WidgetClaims {
  organizationId: string;
  widgetConfigId: string;
  customerId: string | null;
  sessionId: string;
  exp: number;
}

@Injectable()
export class WidgetTokenService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(CONFIG) private readonly config: AppConfig) {}

  async mint(widgetKey: string, origin: string | undefined, customer?: { externalId: string; email?: string; name?: string }): Promise<{ token: string; expiresAt: Date; branding: { title: string; primaryColor: string; locale: string } }> {
    if (origin === undefined) throw new StableHttpError('ORIGIN_NOT_ALLOWED', 'Origin is required');
    const rows = await this.db.select().from(widgetConfigs).where(eq(widgetConfigs.publicKey, widgetKey)).limit(1);
    const widget = rows[0];
    if (widget === undefined) throw new StableHttpError('NOT_FOUND', 'Widget not found');
    const allowed = await this.db.select().from(widgetAllowedOrigins).where(eq(widgetAllowedOrigins.widgetConfigId, widget.id));
    if (!allowed.some((row) => sameOrigin(row.origin, origin))) throw new StableHttpError('ORIGIN_NOT_ALLOWED', 'Origin is not allowed');
    let customerId: string | null = null;
    if (customer !== undefined) {
      const existing = await this.db.select({ id: customers.id }).from(customers).where(and(eq(customers.organizationId, widget.organizationId), eq(customers.externalId, customer.externalId))).limit(1);
      const found = existing[0];
      if (found !== undefined) customerId = found.id;
      else {
        const created = await this.db.insert(customers).values({ organizationId: widget.organizationId, externalId: customer.externalId, email: customer.email, name: customer.name }).returning({ id: customers.id });
        customerId = created[0]?.id ?? null;
      }
    }
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const claims: WidgetClaims = { organizationId: widget.organizationId, widgetConfigId: widget.id, customerId, sessionId: randomBytes(16).toString('hex'), exp: Math.floor(expiresAt.getTime() / 1000) };
    return { token: sign(claims, this.config.WIDGET_TOKEN_SECRET), expiresAt, branding: { title: widget.title, primaryColor: widget.primaryColor, locale: widget.locale } };
  }

  verify(token: string): WidgetClaims | null {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const payload = parts[0];
    const sig = parts[1];
    if (payload === undefined || sig === undefined) return null;
    const expected = createHmac('sha256', this.config.WIDGET_TOKEN_SECRET).update(payload).digest('base64url');
    if (expected !== sig) return null;
    const parsed = parsePayload(Buffer.from(payload, 'base64url').toString('utf8'));
    if (parsed === null || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  }
}

function sign(claims: WidgetClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}

function parsePayload(raw: string): WidgetClaims | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const r = value as Record<string, unknown>;
    if (typeof r.organizationId !== 'string' || typeof r.widgetConfigId !== 'string' || typeof r.sessionId !== 'string' || typeof r.exp !== 'number') return null;
    return { organizationId: r.organizationId, widgetConfigId: r.widgetConfigId, sessionId: r.sessionId, exp: r.exp, customerId: typeof r.customerId === 'string' ? r.customerId : null };
  } catch { return null; }
}

function sameOrigin(allowed: string, actual: string): boolean {
  try {
    const a = new URL(allowed);
    const b = new URL(actual);
    return a.protocol === b.protocol && a.hostname.toLowerCase() === b.hostname.toLowerCase() && a.port === b.port;
  } catch { return false; }
}
