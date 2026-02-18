import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';

@Controller('messages')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  getAll() {
    return this.messagesService.getAll();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body('content') content: string, @Body('userId') userId: string) {
    return this.messagesService.createMessage(content, userId);
  }
}
