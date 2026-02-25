import { Controller, Get, UseGuards } from '@nestjs/common';
import { MessagesService } from 'src/messages/messages.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private messagesService: MessagesService) {}

  @Get('history')
  async getHistory() {
    const messages = await this.messagesService.getAll();
    return messages.map((m) => ({
      id: m.id,
      content: m.content,
      username: m.sender.username,
      createdAt: m.createdAt,
    }));
  }
}