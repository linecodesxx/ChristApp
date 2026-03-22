import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma ORM 7+: URL для миграций и CLI задаётся здесь (не в schema.prisma).
 * Задайте DATABASE_URL в backend/.env или в окружении (см. .env.example).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
