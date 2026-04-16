import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { AgoraService } from './agora.service';

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

    // Generate a unique random uint32 uid per session to avoid UID_CONFLICT
    // when two users share the same deterministic hash collision.
    const uid = Math.floor(Math.random() * 0xfffffffe) + 1;
    const token = this.agoraService.generateToken(resolvedChannelName, uid);

    return {
      channelName: resolvedChannelName,
      token,
      uid,
    };
  }
}
