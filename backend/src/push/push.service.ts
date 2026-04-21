import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PrismaService } from 'src/prisma/prisma.service';
import { MessagesService } from 'src/messages/messages.service';
import { resolveGlobalRoomId } from 'src/config/global-room';
import { userMayAccessRoomByTitle } from 'src/chat/room-access.util';
import { RegisterPushSubscriptionDto } from './dto/push-subscription.dto';
import { MessageType } from '@prisma/client';

const REPLY_META_PREFIX = '[[reply:';
const REPLY_META_SUFFIX = ']]';
const VOICE_META_PREFIX = '[[voice:';
const VOICE_META_SUFFIX = ']]';

type ChatPushNotificationInput = {
  messageId: string;
  roomId: string;
  senderId: string;
  senderUsername: string;
  content: string;
  createdAt: Date;
  messageType?: MessageType;
  fileUrl?: string | null;
};

const PUSH_BODY_MAX_LEN = 220;
/** Ліміт тіла JSON до шифрування web-push (запас до ~4 КБ після overhead). */
const PUSH_JSON_UTF8_MAX_BYTES = 3600;
/** Вище порога не рахуємо badge per-user (дорогий SQL на кожного отримувача). */
const MAX_BADGE_PREFETCH_RECIPIENTS = 40;

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

  private readonly GLOBAL_ROOM = resolveGlobalRoomId();

  private readonly isConfigured: boolean;
  private readonly publicKey: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly messagesService: MessagesService,
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

    const normalizedBody =
      input.messageType === MessageType.IMAGE
        ? 'Фото'
        : input.messageType === ('VIDEO_NOTE' as MessageType)
          ? 'Видео-заметка'
        : this.normalizeMessageBody(input.content);
    if (!normalizedBody) {
      return;
    }

    const { recipientUserIds, roomTitle } = await this.resolveRecipientUserIds(
      input.roomId,
      input.senderId,
    );

    if (!recipientUserIds.length) {
      return;
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
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
    });

    if (!subscriptions.length) {
      return;
    }

    const isGlobalRoom = input.roomId === this.GLOBAL_ROOM;
    const displayBody = this.truncatePushText(normalizedBody, PUSH_BODY_MAX_LEN);
    const { title, body } = this.resolveNotificationDisplay(
      roomTitle ?? undefined,
      isGlobalRoom,
      input.senderUsername,
      displayBody,
    );

    const uniqueRecipientIds = [
      ...new Set(subscriptions.map((sub) => sub.userId)),
    ];
    const badgeByUserId = new Map<string, number>();
    const shouldAttachBadge =
      uniqueRecipientIds.length > 0 &&
      uniqueRecipientIds.length <= MAX_BADGE_PREFETCH_RECIPIENTS;

    if (shouldAttachBadge) {
      await Promise.all(
        uniqueRecipientIds.map(async (userId) => {
          try {
            const summary = await this.messagesService.getUnreadSummary(userId);
            badgeByUserId.set(userId, summary.totalUnread);
          } catch {
            badgeByUserId.set(userId, 1);
          }
        }),
      );
    }

    await Promise.allSettled(
      subscriptions.map((subscription) => {
        const targetUrl = this.resolveTargetUrl(
          roomTitle ?? undefined,
          input.roomId,
          input.senderId,
          subscription.userId,
        );

        const badgeCount = shouldAttachBadge
          ? (badgeByUserId.get(subscription.userId) ?? 1)
          : undefined;

        return this.sendToSubscription(subscription, {
          title,
          body,
          targetUrl,
          roomId: input.roomId,
          senderId: input.senderId,
          createdAt: input.createdAt.toISOString(),
          messageId: input.messageId,
          badgeCount,
        });
      }),
    );
  }

  private async resolveRecipientUserIds(
    roomId: string,
    senderId: string,
  ): Promise<{ recipientUserIds: string[]; roomTitle: string | null }> {
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

      return {
        recipientUserIds: users.map((user) => user.id),
        roomTitle: null,
      };
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { title: true },
    });
    const title = room?.title ?? '';

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

    const rawIds = Array.from(new Set(members.map((member) => member.userId)));
    const recipientUserIds = rawIds.filter((uid) =>
      userMayAccessRoomByTitle(uid, title),
    );

    return { recipientUserIds, roomTitle: room?.title ?? null };
  }

  /**
  * Заголовок сповіщення — ім'я відправника; тіло — контекст чату + текст повідомлення.
   */
  private resolveNotificationDisplay(
    roomTitle: string | undefined,
    isGlobalRoom: boolean,
    senderUsername: string,
    messagePreview: string,
  ): { title: string; body: string } {
    const title = senderUsername.trim() || 'ChristApp';

    if (isGlobalRoom) {
      return {
        title,
        body: `Общий чат · ${messagePreview}`,
      };
    }

    if (roomTitle?.startsWith('dm:')) {
      return { title, body: messagePreview };
    }

    const roomLabel = roomTitle?.trim();
    if (roomLabel) {
      return {
        title,
        body: `${roomLabel} · ${messagePreview}`,
      };
    }

    return { title, body: messagePreview };
  }

  private truncatePushText(text: string, maxLen: number) {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length <= maxLen) {
      return t;
    }
    return `${t.slice(0, maxLen - 1)}…`;
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
      // Для приватного чату відкриваємо маршрут за ID співрозмовника (як очікує фронтенд).
      const directIds = roomTitle.split(':').slice(1);
      const counterpartyId =
        directIds.find((id) => id !== recipientUserId) || senderId;
      return `/chat/${counterpartyId}`;
    }

    return `/chat/${roomId}`;
  }

  private normalizeMessageBody(content: string) {
    const rawContent = String(content || '');
    const trimmed = rawContent.trim();

    if (
      trimmed.startsWith(VOICE_META_PREFIX) &&
      trimmed.endsWith(VOICE_META_SUFFIX)
    ) {
      return 'Голосовое сообщение';
    }

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
      messageId: string;
      badgeCount?: number;
    },
  ) {
    const pushSubscription: webPush.PushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    const payloadString = this.serializePushPayload(
      payload as unknown as Record<string, unknown>,
    );

    try {
      await webPush.sendNotification(pushSubscription, payloadString, {
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
      const statusCode = this.extractPushHttpStatus(error);

      if (statusCode === 404 || statusCode === 410) {
        await this.removeInvalidPushSubscription(subscription, statusCode);
        return;
      }

      if (statusCode === 401 || statusCode === 403) {
        this.logger.warn(
          `Push HTTP ${statusCode} (subscriptionId=${subscription.id}) — проверьте WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY и WEB_PUSH_SUBJECT; ключи должны совпадать с фронтом.`,
        );
        return;
      }

      const bodySnippet =
        error &&
        typeof error === 'object' &&
        'body' in error &&
        typeof (error as { body: unknown }).body === 'string'
          ? ((error as { body: string }).body || '').slice(0, 180)
          : '';
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to send push (subscriptionId=${subscription.id}) HTTP=${statusCode ?? 'n/a'}: ${reason}${
          bodySnippet ? ` | body: ${bodySnippet}` : ''
        }`,
      );
    }
  }

  /** Стискає JSON-рядок сповіщення під ліміт провайдера (після шифрування ліміт жорсткіший). */
  private serializePushPayload(payload: Record<string, unknown>): string {
    const maxBytes = PUSH_JSON_UTF8_MAX_BYTES;
    const working: Record<string, unknown> = { ...payload };
    let str = JSON.stringify(working);
    let guard = 0;

    while (Buffer.byteLength(str, 'utf8') > maxBytes && guard < 14) {
      guard += 1;
      const body = String(working.body ?? '');
      if (body.length > 28) {
        working.body = `${body.slice(0, Math.max(24, Math.floor(body.length * 0.82)))}…`;
      } else {
        const title = String(working.title ?? '');
        working.title =
          title.length > 12
            ? `${title.slice(0, Math.max(8, Math.floor(title.length * 0.85)))}…`
            : title;
        working.body = 'Новое сообщение';
      }
      str = JSON.stringify(working);
    }

    if (Buffer.byteLength(str, 'utf8') > maxBytes) {
      str = JSON.stringify({
        title: 'ChristApp',
        body: 'Новое сообщение',
        targetUrl: working.targetUrl,
        roomId: working.roomId,
        messageId: working.messageId,
        createdAt: working.createdAt,
        senderId: working.senderId,
        ...(typeof working.badgeCount === 'number'
          ? { badgeCount: working.badgeCount }
          : {}),
      });
    }

    return str;
  }

  private extractPushHttpStatus(error: unknown): number | undefined {
    const WebPushErrorCtor = (
      webPush as {
        WebPushError?: new (...args: never[]) => Error & { statusCode: number };
      }
    ).WebPushError;

    if (WebPushErrorCtor && error instanceof WebPushErrorCtor) {
      const sc = error.statusCode;
      return typeof sc === 'number' && Number.isFinite(sc) ? sc : undefined;
    }

    if (error && typeof error === 'object' && 'statusCode' in error) {
      const sc = (error as { statusCode: unknown }).statusCode;
      return typeof sc === 'number' && Number.isFinite(sc) ? sc : undefined;
    }

    return undefined;
  }

  async sendCallPush(input: {
    callerId: string;
    callerName: string;
    targetUserId: string;
    targetUrl: string;
  }) {
    if (!this.isConfigured) {
      return;
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: input.targetUserId },
      select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true },
    });

    if (!subscriptions.length) {
      return;
    }

    const title = input.callerName;
    const body = 'Входящий аудиозвонок';
    const createdAt = new Date().toISOString();

    await Promise.allSettled(
      subscriptions.map((sub) =>
        this.sendToSubscription(sub, {
          title,
          body,
          targetUrl: input.targetUrl,
          roomId: input.callerId,
          senderId: input.callerId,
          createdAt,
          messageId: '',
        }),
      ),
    );
  }

  private async removeInvalidPushSubscription(
    subscription: PushSubscriptionRecord,
    httpStatus: number,
  ) {
    try {
      await this.prisma.pushSubscription.delete({
        where: { id: subscription.id },
      });
    } catch {
      await this.prisma.pushSubscription.deleteMany({
        where: { endpoint: subscription.endpoint },
      });
    }

    this.logger.log(
      `Push subscription removed (HTTP ${httpStatus}, id=${subscription.id}) — подписка недействительна.`,
    );
  }
}
