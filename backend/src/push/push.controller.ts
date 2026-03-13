import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { MessagesService } from 'src/messages/messages.service';
import {
  RegisterPushSubscriptionDto,
  UnsubscribePushSubscriptionDto,
} from './dto/push-subscription.dto';
import { PushService } from './push.service';

type AuthenticatedRequest = {
  user?: {
    id?: string;
  };
  headers: Record<string, string | string[] | undefined>;
};

@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(
    private readonly pushService: PushService,
    private readonly messagesService: MessagesService,
  ) {}

  @Get('public-key')
  getPublicKey() {
    return this.pushService.getPublicConfig();
  }

  @Get('status')
  async getStatus(@Req() req: AuthenticatedRequest) {
    const userId = this.resolveUserId(req);
    return this.pushService.getStatus(userId);
  }

  @Get('unread-summary')
  async getUnreadSummary(@Req() req: AuthenticatedRequest) {
    const userId = this.resolveUserId(req);
    return this.messagesService.getUnreadSummary(userId);
  }

  @Post('subscribe')
  async subscribe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterPushSubscriptionDto,
  ) {
    const userId = this.resolveUserId(req);
    const userAgentHeader = req.headers['user-agent'];
    const userAgent = Array.isArray(userAgentHeader)
      ? userAgentHeader[0]
      : userAgentHeader;

    return this.pushService.upsertSubscription(userId, dto, userAgent);
  }

  @Post('unsubscribe')
  async unsubscribe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UnsubscribePushSubscriptionDto,
  ) {
    const userId = this.resolveUserId(req);
    return this.pushService.unsubscribe(userId, dto.endpoint);
  }

  private resolveUserId(req: AuthenticatedRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Не авторизован');
    }

    return userId;
  }
}
