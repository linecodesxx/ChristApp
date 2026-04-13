import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { join } from 'path';
import { AppModule } from './app.module';

/**
 * З credentials: true не можна віддавати Access-Control-Allow-Origin: * — браузер блокує
 * запит (у консолі часто видно лише «Failed to fetch» на register/login).
 */
function parseAllowedCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (raw && raw !== '*') {
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
  }
  if (process.env.NODE_ENV !== 'production') {
    return [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://[::1]:3000',
    ];
  }
  const front = process.env.FRONTEND_URL?.trim();
  if (front) {
    return [front.replace(/\/+$/, '')];
  }
  console.warn(
    '[CORS] В production задайте CORS_ORIGIN (точный origin фронта, через запятую) или FRONTEND_URL. Иначе кросс-доменные запросы с cookies не пройдут.',
  );
  return ['http://localhost:3000'];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(cookieParser());
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  const corsOrigins = parseAllowedCorsOrigins();
  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin) {
        callback(null, true);
        return;
      }
      callback(null, corsOrigins.includes(requestOrigin));
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
