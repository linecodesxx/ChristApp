import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
})
export class AdminModule {}
