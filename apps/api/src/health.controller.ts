import { Controller, Get, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { type Database } from '@acs/persistence';
import { sql } from 'drizzle-orm';
import { DB, REDIS } from './common/tokens';

@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database, @Inject(REDIS) private readonly redis: Redis) {}
  @Get('live') live(): { status: 'ok' } { return { status: 'ok' }; }
  @Get('ready') async ready(): Promise<{ status: 'ok'; checks: { postgres: 'ok'; redis: 'ok' } }> {
    await this.db.execute(sql`select 1`);
    await this.redis.ping();
    return { status: 'ok', checks: { postgres: 'ok', redis: 'ok' } };
  }
}
