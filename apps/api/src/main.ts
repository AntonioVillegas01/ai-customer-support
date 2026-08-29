import 'reflect-metadata';
import { json } from 'express';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { loadConfig } from '@acs/config';
import { createLogger } from '@acs/logger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({ appName: 'api', level: config.LOG_LEVEL });
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.use(helmet());
  app.use(json({ limit: `${config.REQUEST_BODY_LIMIT_MB}mb` }));
  app.enableCors({ origin: config.CORS_ALLOWED_ORIGINS, credentials: true });
  app.setGlobalPrefix('v1', { exclude: ['health/live', 'health/ready'] });
  app.enableShutdownHooks();
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('ACS API').setVersion('1.0').addBearerAuth().build());
  SwaggerModule.setup('docs', app, doc);
  await app.listen(config.API_PORT);
  logger.info({ port: config.API_PORT }, 'api started');
}

void bootstrap();
