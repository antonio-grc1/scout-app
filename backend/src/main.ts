import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';
import { env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new PrismaExceptionFilter());
  const corsOrigins =
    env.CORS_ORIGIN && env.CORS_ORIGIN !== '*'
      ? env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
      : process.env.NODE_ENV === 'production'
        ? false
        : true;
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.enableShutdownHooks();
  await app.listen(env.PORT);
}
await bootstrap();
