import { Controller, Get, UseGuards } from '@nestjs/common';
import { MessagesService } from 'src/messages/messages.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private messagesService: MessagesService) {}

  @Get('history')
  async getHistory() {
    const messages = await this.messagesService.getGlobalRoomMessages(200, 0);
    return messages.map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content ?? '',
      fileUrl: m.fileUrl ?? undefined,
      username: m.sender.nickname || m.sender.username,
      handle: m.sender.username,
      senderId: m.senderId,
      createdAt: m.createdAt,
    }));
  }
}