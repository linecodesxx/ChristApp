import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  providers: [MessagesService],
  imports: [PrismaModule],
  controllers: [MessagesController],
  exports: [MessagesService],
})
export class MessagesModule {}
