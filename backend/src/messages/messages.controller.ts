import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  UnauthorizedException,
  Query,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';

type AuthenticatedRequest = {
  user?: { id?: string };
};

@Controller('messages')
export class MessagesController {
  constructor(private messagesService: MessagesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  getGlobalMessages(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException();
    }
    const parsedLimit = Math.min(
      Math.max(parseInt(limit ?? '50', 10) || 50, 1),
      200,
    );
    const parsedSkip = Math.max(parseInt(skip ?? '0', 10) || 0, 0);
    return this.messagesService.getGlobalRoomMessages(parsedLimit, parsedSkip);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body('content') content: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.messagesService.createMessage(content, userId);
  }
}
