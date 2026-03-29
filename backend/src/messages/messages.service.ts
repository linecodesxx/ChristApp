import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { resolveGlobalRoomId } from 'src/config/global-room';
import { userMayAccessRoomByTitle } from 'src/chat/room-access.util';
import { canUserPostToRoom } from 'src/chat/user-may-post-to-room';
import { VOICE_META_PREFIX, VOICE_META_SUFFIX } from './voice-message';

type UnreadRoomSummaryRow = {
  roomId: string;
  unreadCount: number;
  messageId: string | null;
  messageContent: string | null;
  messageCreatedAt: Date | string | null;
  messageSenderId: string | null;
  messageSenderUsername: string | null;
};

type RoomLastMessageSummary = {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  senderUsername: string;
};

type RoomUnreadSummary = {
  roomId: string;
  unread: number;
  lastMessage: RoomLastMessageSummary | null;
};

export type UnreadSummaryResult = {
  totalUnread: number;
  rooms: RoomUnreadSummary[];
};

export type DeleteOwnMessageResult =
  | { ok: true; messageId: string; roomId: string }
  | { ok: false; reason: 'not-found' | 'not-owner' | 'no-access' };

/** @deprecated используйте DeleteOwnMessageResult */
export type DeleteOwnGlobalMessageResult = DeleteOwnMessageResult;

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  private readonly GLOBAL_ROOM = resolveGlobalRoomId();

  private readonly REPLY_META_PREFIX = '[[reply:';
  private readonly REPLY_META_SUFFIX = ']]';

  constructor(private prisma: PrismaService) {}

  userCanPostToRoom(userId: string, roomId: string) {
    return canUserPostToRoom(this.prisma, userId, roomId);
  }

  async createMessage(content: string, userId: string) {
    return this.prisma.message.create({
      data: {
        content,
        senderId: userId,
        roomId: this.GLOBAL_ROOM,
      },
      include: {
        sender: true,
      },
    });
  }

  async createRoomMessage(content: string, userId: string, roomId: string) {
    return this.prisma.message.create({
      data: {
        content,
        senderId: userId,
        roomId,
      },
      include: {
        sender: true,
      },
    });
  }

  /**
   * Последние `limit` сообщений комнаты (хронологически: старые → новые).
   * Раньше использовался order asc + take — отдавались самые старые N сообщений,
   * из‑за чего при большой истории новые пропадали после перезагрузки.
   */
  async getRoomMessages(roomId: string, limit = 50, skip = 0) {
    const rows = await this.prisma.message.findMany({
      where: { roomId },
      include: { sender: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    });
    return rows.reverse();
  }

  async getAll(limit = 50, skip = 0) {
    return this.prisma.message.findMany({
      include: { sender: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip,
    });
  }

  /** Сообщения только общей комнаты (без личных и прочих комнат). */
  async getGlobalRoomMessages(limit = 50, skip = 0) {
    return this.getRoomMessages(this.GLOBAL_ROOM, limit, skip);
  }

  /**
   * Удаление своего сообщения: общий чат или любая комната, где пользователь — участник (личные чаты и т.д.).
   */
  async deleteOwnMessage(messageId: string, userId: string): Promise<DeleteOwnMessageResult> {
    const existingMessage = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        roomId: true,
        senderId: true,
      },
    });

    if (!existingMessage) {
      return { ok: false, reason: 'not-found' };
    }

    if (existingMessage.senderId !== userId) {
      return { ok: false, reason: 'not-owner' };
    }

    const messageRoomId = existingMessage.roomId;

    if (messageRoomId !== this.GLOBAL_ROOM) {
      const member = await this.prisma.roomMember.findUnique({
        where: {
          roomId_userId: {
            roomId: messageRoomId,
            userId,
          },
        },
      });
      if (!member) {
        return { ok: false, reason: 'no-access' };
      }

      const room = await this.prisma.room.findUnique({
        where: { id: messageRoomId },
        select: { title: true },
      });
      if (!room || !userMayAccessRoomByTitle(userId, room.title)) {
        return { ok: false, reason: 'no-access' };
      }
    }

    await this.prisma.message.delete({
      where: {
        id: existingMessage.id,
      },
    });

    return {
      ok: true,
      messageId: existingMessage.id,
      roomId: existingMessage.roomId,
    };
  }

  /** @deprecated используйте deleteOwnMessage */
  async deleteOwnGlobalMessage(
    messageId: string,
    userId: string,
    _globalRoomId = this.GLOBAL_ROOM,
  ): Promise<DeleteOwnMessageResult> {
    return this.deleteOwnMessage(messageId, userId);
  }

  async markRoomAsRead(roomId: string, userId: string, lastReadAt = new Date()) {
    await this.prisma.roomReadState.upsert({
      where: {
        roomId_userId: {
          roomId,
          userId,
        },
      },
      update: {
        lastReadAt,
      },
      create: {
        roomId,
        userId,
        lastReadAt,
      },
    });
  }

  async getUnreadSummary(userId: string): Promise<UnreadSummaryResult> {
    // Один запрос сразу по всем доступным комнатам:
    // unread + последнее сообщение по каждой комнате.
    try {
      return await this.fetchUnreadSummaryRows(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`getUnreadSummary failed for userId=${userId}: ${message}`, err);
      throw err;
    }
  }

  private async fetchUnreadSummaryRows(userId: string): Promise<UnreadSummaryResult> {
    const memberRows = await this.prisma.roomMember.findMany({
      where: { userId },
      select: { roomId: true },
    });

    const roomIds = Array.from(
      new Set<string>([this.GLOBAL_ROOM, ...memberRows.map((row) => row.roomId)]),
    );

    const roomsMeta = await this.prisma.room.findMany({
      where: { id: { in: roomIds } },
      select: { id: true, title: true },
    });

    const roomIdsForAccess = roomIds.filter((rid) => {
      if (rid === this.GLOBAL_ROOM) {
        return true;
      }
      const room = roomsMeta.find((r) => r.id === rid);
      if (!room) {
        return false;
      }
      return userMayAccessRoomByTitle(userId, room.title);
    });

    const rows = await this.prisma.$queryRaw<UnreadRoomSummaryRow[]>`
      WITH accessible_rooms AS (
        SELECT r.id AS "roomId"
        FROM "Room" r
        WHERE r.id IN (${Prisma.join(roomIdsForAccess)})
      ),
      unread_counts AS (
        SELECT
          m."roomId" AS "roomId",
          COUNT(*)::int AS unread_n
        FROM "Message" m
        INNER JOIN accessible_rooms ar
          ON ar."roomId" = m."roomId"
        LEFT JOIN "RoomReadState" rrs
          ON rrs."roomId" = m."roomId"
         AND rrs."userId" = ${userId}
        WHERE m."senderId" <> ${userId}
          AND m."createdAt" > COALESCE(rrs."lastReadAt", to_timestamp(0))
        GROUP BY m."roomId"
      ),
      latest_messages AS (
        SELECT DISTINCT ON (m."roomId")
          m."roomId" AS "roomId",
          m.id AS "messageId",
          m.content AS "messageContent",
          m."createdAt" AS "messageCreatedAt",
          m."senderId" AS "messageSenderId",
          u.username AS "messageSenderUsername"
        FROM "Message" m
        INNER JOIN accessible_rooms ar
          ON ar."roomId" = m."roomId"
        INNER JOIN "User" u
          ON u.id = m."senderId"
        ORDER BY m."roomId", m."createdAt" DESC
      )
      SELECT
        ar."roomId" AS "roomId",
        COALESCE(uc.unread_n, 0)::int AS "unreadCount",
        lm."messageId" AS "messageId",
        lm."messageContent" AS "messageContent",
        lm."messageCreatedAt" AS "messageCreatedAt",
        lm."messageSenderId" AS "messageSenderId",
        lm."messageSenderUsername" AS "messageSenderUsername"
      FROM accessible_rooms ar
      LEFT JOIN unread_counts uc
        ON uc."roomId" = ar."roomId"
      LEFT JOIN latest_messages lm
        ON lm."roomId" = ar."roomId"
      ORDER BY lm."messageCreatedAt" DESC NULLS LAST, ar."roomId" ASC
    `;

    const rooms = rows
      .map((row) => ({
        roomId: String(row.roomId),
        unread: Number(row.unreadCount) || 0,
        lastMessage: this.toLastMessageSummary(row),
      }))
      .sort((left, right) => {
        const leftTs = left.lastMessage ? new Date(left.lastMessage.createdAt).getTime() : 0;
        const rightTs = right.lastMessage
          ? new Date(right.lastMessage.createdAt).getTime()
          : 0;

        if (leftTs !== rightTs) {
          return rightTs - leftTs;
        }

        return right.unread - left.unread;
      });

    const totalUnread = rooms.reduce((sum, room) => sum + room.unread, 0);

    return {
      totalUnread,
      rooms,
    };
  }

  private toLastMessageSummary(row: UnreadRoomSummaryRow): RoomLastMessageSummary | null {
    if (
      !row.messageId ||
      !row.messageCreatedAt ||
      !row.messageSenderId ||
      !row.messageSenderUsername
    ) {
      return null;
    }

    const normalizedContent = this.normalizeMessagePreview(row.messageContent);
    const normalizedCreatedAt = this.normalizeSummaryCreatedAt(
      row.messageCreatedAt,
    );
    if (!normalizedContent) {
      return null;
    }

    if (!normalizedCreatedAt) {
      return null;
    }

    return {
      id: row.messageId,
      content: normalizedContent,
      createdAt: normalizedCreatedAt,
      senderId: row.messageSenderId,
      senderUsername: row.messageSenderUsername,
    };
  }

  private normalizeSummaryCreatedAt(
    value: Date | string | null | undefined,
  ): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        return null;
      }

      return value.toISOString();
    }

    if (typeof value === 'string') {
      const parsedDate = new Date(value);
      if (Number.isNaN(parsedDate.getTime())) {
        return null;
      }

      return parsedDate.toISOString();
    }

    return null;
  }

  private normalizeMessagePreview(content: string | null | undefined) {
    const rawContent = String(content || '');
    const trimmed = rawContent.trim();

    if (
      trimmed.startsWith(VOICE_META_PREFIX) &&
      trimmed.endsWith(VOICE_META_SUFFIX)
    ) {
      return 'Голосовое сообщение';
    }

    if (!rawContent.startsWith(this.REPLY_META_PREFIX)) {
      return rawContent.replace(/\s+/g, ' ').trim();
    }

    const suffixIndex = rawContent.indexOf(
      this.REPLY_META_SUFFIX,
      this.REPLY_META_PREFIX.length,
    );

    if (suffixIndex === -1) {
      return rawContent.replace(/\s+/g, ' ').trim();
    }

    return rawContent
      .slice(suffixIndex + this.REPLY_META_SUFFIX.length)
      .replace(/\s+/g, ' ')
      .trim();
  }

}
