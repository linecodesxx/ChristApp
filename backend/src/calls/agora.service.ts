import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RtcRole, RtcTokenBuilder } from 'agora-access-token';

@Injectable()
export class AgoraService {
  constructor(private readonly configService: ConfigService) {}

  generateToken(channelName: string, uid: number): string {
    const appId = this.configService.get<string>('AGORA_APP_ID')?.trim();
    const appCertificate = this.configService
      .get<string>('AGORA_APP_CERTIFICATE')
      ?.trim();
    const normalizedChannelName = channelName.trim();

    if (!normalizedChannelName) {
      throw new BadRequestException('channelName обязателен');
    }

    if (!appId || !appCertificate) {
      throw new InternalServerErrorException(
        'Agora не настроена: задайте AGORA_APP_ID и AGORA_APP_CERTIFICATE',
      );
    }

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const expirationInSeconds = nowInSeconds + 60 * 60;

    return RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      normalizedChannelName,
      uid,
      RtcRole.PUBLISHER,
      expirationInSeconds,
    );
  }
}
