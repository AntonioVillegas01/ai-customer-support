import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '@acs/config';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const config = loadConfig({ ...process.env, APP_NAME: 'worker' });
  const app = await NestFactory.create(WorkerModule, { logger: ['error', 'warn', 'log'] });
  app.enableShutdownHooks();
  await app.listen(config.WORKER_HEALTH_PORT);
}
void bootstrap();
