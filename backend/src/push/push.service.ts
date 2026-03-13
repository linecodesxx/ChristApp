import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PrismaService } from 'src/prisma/prisma.service';
import { RegisterPushSubscriptionDto } from './dto/push-subscription.dto';

const REPLY_META_PREFIX = '[[reply:';
const REPLY_META_SUFFIX = ']]';

type ChatPushNotificationInput = {
  roomId: string;
  senderId: string;
  senderUsername: string;
  content: string;
  createdAt: Date;
};

type PushSubscriptionRecord = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  private readonly GLOBAL_ROOM =
    process.env.GLOBAL_ROOM_ID ?? '00000000-0000-0000-0000-000000000001';

  private readonly isConfigured: boolean;
  private readonly publicKey: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const publicKey =
      this.configService.get<string>('WEB_PUSH_PUBLIC_KEY')?.trim() || '';
    const privateKey =
      this.configService.get<string>('WEB_PUSH_PRIVATE_KEY')?.trim() || '';
    const subject =
      this.configService.get<string>('WEB_PUSH_SUBJECT')?.trim() ||
      'mailto:notifications@christapp.local';

    if (publicKey && privateKey) {
      webPush.setVapidDetails(subject, publicKey, privateKey);
      this.isConfigured = true;
      this.publicKey = publicKey;
      return;
    }

    this.isConfigured = false;
    this.publicKey = null;
    this.logger.warn(
      'Web Push disabled: set WEB_PUSH_PUBLIC_KEY and WEB_PUSH_PRIVATE_KEY in backend environment.',
    );
  }

  getPublicConfig() {
    return {
      enabled: this.isConfigured,
      publicKey: this.publicKey,
    };
  }

  async getStatus(userId: string) {
    const subscriptionsCount = await this.prisma.pushSubscription.count({
      where: { userId },
    });

    return {
      enabled: this.isConfigured,
      hasSubscription: subscriptionsCount > 0,
      subscriptionsCount,
    };
  }

  async upsertSubscription(
    userId: string,
    dto: RegisterPushSubscriptionDto,
    userAgent?: string,
  ) {
    const endpoint = dto.endpoint?.trim();
    const p256dh = dto.keys?.p256dh?.trim();
    const auth = dto.keys?.auth?.trim();

    if (!endpoint || !p256dh || !auth) {
      throw new BadRequestException('Некорректная push-подписка');
    }

    const subscription = await this.prisma.pushSubscription.upsert({
      where: {
        endpoint,
      },
      update: {
        userId,
        p256dh,
        auth,
        expirationTime:
          typeof dto.expirationTime === 'number'
            ? String(dto.expirationTime)
            : null,
        userAgent: userAgent?.trim() || null,
      },
      create: {
        userId,
        endpoint,
        p256dh,
        auth,
        expirationTime:
          typeof dto.expirationTime === 'number'
            ? String(dto.expirationTime)
            : null,
        userAgent: userAgent?.trim() || null,
      },
    });

    return {
      ok: true,
      subscriptionId: subscription.id,
    };
  }

  async unsubscribe(userId: string, endpoint: string) {
    const normalizedEndpoint = endpoint?.trim();

    if (!normalizedEndpoint) {
      throw new BadRequestException('endpoint обязателен');
    }

    const { count } = await this.prisma.pushSubscription.deleteMany({
      where: {
        userId,
        endpoint: normalizedEndpoint,
      },
    });

    return {
      ok: true,
      removed: count,
    };
  }

  async sendChatMessagePush(input: ChatPushNotificationInput) {
    if (!this.isConfigured) {
      return;
    }

    const normalizedBody = this.normalizeMessageBody(input.content);
    if (!normalizedBody) {
      return;
    }

    const recipientUserIds = await this.resolveRecipientUserIds(
      input.roomId,
      input.senderId,
    );

    if (!recipientUserIds.length) {
      return;
    }

    const [room, subscriptions] = await Promise.all([
      this.prisma.room.findUnique({
        where: { id: input.roomId },
        select: {
          title: true,
        },
      }),
      this.prisma.pushSubscription.findMany({
        where: {
          userId: { in: recipientUserIds },
        },
        select: {
          id: true,
          userId: true,
          endpoint: true,
          p256dh: true,
          auth: true,
        },
      }),
    ]);

    if (!subscriptions.length) {
      return;
    }

    const isGlobalRoom = input.roomId === this.GLOBAL_ROOM;

    await Promise.allSettled(
      subscriptions.map((subscription) => {
        const targetUrl = this.resolveTargetUrl(
          room?.title,
          input.roomId,
          input.senderId,
          subscription.userId,
        );

        const title = this.resolveNotificationTitle(
          room?.title,
          isGlobalRoom,
          input.senderUsername,
        );

        return this.sendToSubscription(subscription, {
          title,
          body: normalizedBody,
          targetUrl,
          roomId: input.roomId,
          senderId: input.senderId,
          createdAt: input.createdAt.toISOString(),
        });
      }),
    );
  }

  private async resolveRecipientUserIds(roomId: string, senderId: string) {
    if (roomId === this.GLOBAL_ROOM) {
      const users = await this.prisma.user.findMany({
        where: {
          id: {
            not: senderId,
          },
          isActive: true,
        },
        select: {
          id: true,
        },
      });

      return users.map((user) => user.id);
    }

    const members = await this.prisma.roomMember.findMany({
      where: {
        roomId,
        userId: {
          not: senderId,
        },
      },
      select: {
        userId: true,
      },
    });

    return Array.from(new Set(members.map((member) => member.userId)));
  }

  private resolveNotificationTitle(
    roomTitle: string | undefined,
    isGlobalRoom: boolean,
    senderUsername: string,
  ) {
    if (isGlobalRoom) {
      return 'Новое сообщение в общем чате';
    }

    if (roomTitle?.startsWith('dm:')) {
      return `Новое сообщение от ${senderUsername}`;
    }

    if (roomTitle?.trim()) {
      return `Новое сообщение в чате ${roomTitle.trim()}`;
    }

    return `Новое сообщение от ${senderUsername}`;
  }

  private resolveTargetUrl(
    roomTitle: string | undefined,
    roomId: string,
    senderId: string,
    recipientUserId: string,
  ) {
    if (roomId === this.GLOBAL_ROOM) {
      return '/chat/global';
    }

    if (roomTitle?.startsWith('dm:')) {
      // Для личного чата открываем маршрут по ID собеседника (как ожидает фронтенд).
      const directIds = roomTitle.split(':').slice(1);
      const counterpartyId =
        directIds.find((id) => id !== recipientUserId) || senderId;
      return `/chat/${counterpartyId}`;
    }

    return `/chat/${roomId}`;
  }

  private normalizeMessageBody(content: string) {
    const rawContent = String(content || '');

    if (!rawContent.startsWith(REPLY_META_PREFIX)) {
      return rawContent.replace(/\s+/g, ' ').trim();
    }

    const suffixIndex = rawContent.indexOf(
      REPLY_META_SUFFIX,
      REPLY_META_PREFIX.length,
    );

    if (suffixIndex === -1) {
      return rawContent.replace(/\s+/g, ' ').trim();
    }

    return rawContent
      .slice(suffixIndex + REPLY_META_SUFFIX.length)
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async sendToSubscription(
    subscription: PushSubscriptionRecord,
    payload: {
      title: string;
      body: string;
      targetUrl: string;
      roomId: string;
      senderId: string;
      createdAt: string;
    },
  ) {
    const pushSubscription: webPush.PushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    try {
      await webPush.sendNotification(pushSubscription, JSON.stringify(payload), {
        TTL: 60 * 60,
        urgency: 'high',
      });

      await this.prisma.pushSubscription.update({
        where: {
          id: subscription.id,
        },
        data: {
          lastUsedAt: new Date(),
        },
      });
    } catch (error: unknown) {
      const statusCode = this.getStatusCode(error);
      if (statusCode === 404 || statusCode === 410) {
        await this.prisma.pushSubscription.deleteMany({
          where: {
            endpoint: subscription.endpoint,
          },
        });
        return;
      }

      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to send push notification (subscriptionId=${subscription.id}): ${reason}`,
      );
    }
  }

  private getStatusCode(error: unknown) {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const value = (error as { statusCode?: unknown }).statusCode;
    return typeof value === 'number' ? value : undefined;
  }
}
