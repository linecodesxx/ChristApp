import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const adapter = new PrismaPg(pool);

    super({
      adapter,
      // Добавь это временно, чтобы Render "проснулся"
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    } as any); // as any нужен, чтобы обойти капризы типов Prisma 7
  }

  async onModuleInit() {
    await this.$connect();
  }
}
