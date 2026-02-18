import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { AuthModule } from 'src/auth/auth.module';
import { MessagesModule } from 'src/messages/messages.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  providers: [ChatGateway],
  imports: [PrismaModule, MessagesModule, AuthModule],
})
export class ChatModule {}
