import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import Redis from 'ioredis';
import { type AppConfig } from '@acs/config';
import { apiKeys, memberships, organizations, sessions, users, type Database } from '@acs/persistence';
import { CONFIG, DB, REDIS } from '../common/tokens';
import { StableHttpError } from '../common/auth-errors';

export interface UserSessionContext {
  userId: string;
  email: string;
  memberships: { organizationId: string; role: string }[];
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async register(input: { email: string; password: string; name: string }): Promise<{ userId: string; organizationId: string }> {
    const email = input.email.toLowerCase();
    const slugBase = email.split('@')[0]?.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'org';
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const rows = await this.db.transaction(async (tx) => {
      const createdUsers = await tx.insert(users).values({ email, name: input.name, passwordHash }).returning({ id: users.id });
      const userId = requireOne(createdUsers).id;
      const createdOrgs = await tx.insert(organizations).values({ name: `${input.name}'s Organization`, slug: `${slugBase}-${randomBytes(3).toString('hex')}` }).returning({ id: organizations.id });
      const organizationId = requireOne(createdOrgs).id;
      await tx.insert(memberships).values({ userId, organizationId, role: 'owner' });
      return { userId, organizationId };
    });
    return rows;
  }

  async login(emailInput: string, password: string, ip: string): Promise<{ token: string; csrfToken: string; user: UserSessionContext }> {
    const email = emailInput.toLowerCase();
    const ipAllowed = await this.incrementAndCheck(`auth:ip:${ip}`, 20, 60);
    if (!ipAllowed) throw new StableHttpError('RATE_LIMITED', 'Too many login attempts');
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];
    if (user === undefined) throw new StableHttpError('INVALID_CREDENTIALS', 'Invalid credentials');
    if (user.lockedUntil !== null && user.lockedUntil > new Date()) throw new StableHttpError('ACCOUNT_LOCKED', 'Account temporarily locked');
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) {
      const attempts = user.failedLoginAttempts + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null;
      await this.db.update(users).set({ failedLoginAttempts: attempts, lockedUntil }).where(eq(users.id, user.id));
      throw new StableHttpError('INVALID_CREDENTIALS', 'Invalid credentials');
    }
    await this.db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id));
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const tokenHash = hashSessionToken(token, this.config.SESSION_SECRET);
    await this.db.insert(sessions).values({ userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000) });
    return { token, csrfToken, user: await this.sessionContext(user.id) };
  }

  async logout(token: string): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, hashSessionToken(token, this.config.SESSION_SECRET)));
  }

  async resolve(token: string): Promise<UserSessionContext | null> {
    const tokenHash = hashSessionToken(token, this.config.SESSION_SECRET);
    const rows = await this.db.select({ userId: sessions.userId, expiresAt: sessions.expiresAt }).from(sessions).where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt))).limit(1);
    const row = rows[0];
    if (row === undefined || row.expiresAt < new Date()) return null;
    return this.sessionContext(row.userId);
  }

  async authenticateApiKey(key: string): Promise<{ organizationId: string; apiKeyId: string; scopes: string[] } | null> {
    const parsed = parseApiKey(key);
    if (parsed === null) return null;
    const hash = hashApiKey(key, this.config.API_KEY_PEPPER);
    const rows = await this.db.select().from(apiKeys).where(and(eq(apiKeys.prefix, parsed.prefix), eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt))).limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    await this.db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
    return { organizationId: row.organizationId, apiKeyId: row.id, scopes: row.scopes };
  }

  private async sessionContext(userId: string): Promise<UserSessionContext> {
    const userRows = await this.db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    const user = userRows[0];
    if (user === undefined) throw new StableHttpError('UNAUTHENTICATED', 'Session user not found');
    const membershipRows = await this.db.select({ organizationId: memberships.organizationId, role: memberships.role }).from(memberships).where(eq(memberships.userId, userId));
    return { userId: user.id, email: user.email, memberships: membershipRows };
  }

  private async incrementAndCheck(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, windowSeconds);
    return count <= limit;
  }
}

export function hashSessionToken(token: string, secret: string): string {
  return createHash('sha256').update(`${secret}:${token}`).digest('hex');
}

export function hashApiKey(key: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${key}`).digest('hex');
}

export function safeCompare(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function parseApiKey(key: string): { prefix: string } | null {
  const parts = key.split('_');
  if (parts.length !== 4 || parts[0] !== 'acs' || parts[1] !== 'live') return null;
  const prefix = parts[2];
  return prefix === undefined || prefix.length === 0 ? null : { prefix };
}

function requireOne<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new StableHttpError('CONFLICT', 'Expected row was not created');
  return row;
}
