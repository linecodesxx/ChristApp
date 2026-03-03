import { Module } from '@nestjs/common';
import { VersesService } from './verses.service';
import { VersesController } from './verses.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [VersesService],
  controllers: [VersesController],
})
export class VersesModule {}
