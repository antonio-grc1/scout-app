import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module.js';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';
import { env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new PrismaExceptionFilter());
  const normalizarOrigen = (o: string) => o.trim().replace(/\/+$/, '');
  const origenesEnv =
    env.CORS_ORIGIN && env.CORS_ORIGIN !== '*'
      ? env.CORS_ORIGIN.split(',').map(normalizarOrigen).filter(Boolean)
      : [];
  const origenAppUrl = (() => {
    try {
      return new URL(env.APP_URL).origin;
    } catch {
      return null;
    }
  })();
  const corsOrigins =
    origenesEnv.length > 0
      ? origenesEnv
      : process.env.NODE_ENV === 'production'
        ? origenAppUrl && !origenAppUrl.includes('localhost')
          ? [origenAppUrl]
          : false
        : true;
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}
await bootstrap();
