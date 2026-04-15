import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { AgoraService } from './agora.service';
import { toAgoraUid } from './agora-uid.util';

type AuthenticatedRequest = {
  user?: { id?: string };
};

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private readonly agoraService: AgoraService) {}

  @Get('token')
  getCallToken(
    @Req() req: AuthenticatedRequest,
    @Query('channelName') channelName?: string,
  ) {
    const userId = req.user?.id?.trim();
    if (!userId) {
      throw new BadRequestException('Пользователь не авторизован');
    }

    const resolvedChannelName = channelName?.trim();
    if (!resolvedChannelName) {
      throw new BadRequestException('channelName обязателен');
    }

    const uid = Number(toAgoraUid(userId));
    const token = this.agoraService.generateToken(resolvedChannelName, uid);

    return {
      channelName: resolvedChannelName,
      token,
      uid,
    };
  }
}
