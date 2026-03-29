import { Module, forwardRef } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ChatModule } from 'src/chat/chat.module';
import { CloudinaryModule } from 'src/cloudinary/cloudinary.module';

@Module({
  providers: [MessagesService],
  imports: [PrismaModule, forwardRef(() => ChatModule), CloudinaryModule],
  controllers: [MessagesController],
  exports: [MessagesService],
})
export class MessagesModule {}
