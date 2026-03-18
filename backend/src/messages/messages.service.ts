import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

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

export type DeleteOwnGlobalMessageResult =
  | { ok: true; messageId: string; roomId: string }
  | { ok: false; reason: 'not-found' | 'not-owner' | 'not-global-room' };

@Injectable()
export class MessagesService {
  private readonly GLOBAL_ROOM =
    process.env.GLOBAL_ROOM_ID ?? '00000000-0000-0000-0000-000000000001';

  private readonly REPLY_META_PREFIX = '[[reply:';
  private readonly REPLY_META_SUFFIX = ']]';

  constructor(private prisma: PrismaService) {}

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

  async getRoomMessages(roomId: string, limit = 50, skip = 0) {
    return this.prisma.message.findMany({
      where: { roomId },
      include: { sender: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip,
    });
  }

  async getAll(limit = 50, skip = 0) {
    return this.prisma.message.findMany({
      include: { sender: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
      skip,
    });
  }

  async deleteOwnGlobalMessage(
    messageId: string,
    userId: string,
    globalRoomId = this.GLOBAL_ROOM,
  ): Promise<DeleteOwnGlobalMessageResult> {
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

    if (existingMessage.roomId !== globalRoomId) {
      return { ok: false, reason: 'not-global-room' };
    }

    if (existingMessage.senderId !== userId) {
      return { ok: false, reason: 'not-owner' };
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

  async markRoomAsRead(roomId: string, userId: string, lastReadAt = new Date()) {
    const initialLastReadAt = new Date('1970-01-01T00:00:00Z');
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
        lastReadAt: initialLastReadAt,
      },
    });
  }

  async getUnreadSummary(userId: string): Promise<UnreadSummaryResult> {
    // Один запрос сразу по всем доступным комнатам:
    // unread + последнее сообщение по каждой комнате.
    const rows = await this.prisma.$queryRaw<UnreadRoomSummaryRow[]>`
      WITH accessible_rooms AS (
        SELECT r.id AS "roomId"
        FROM "Room" r
        WHERE r.id = ${this.GLOBAL_ROOM}
           OR EXISTS (
             SELECT 1
             FROM "RoomMember" rm
             WHERE rm."roomId" = r.id
               AND rm."userId" = ${userId}
           )
      ),
      unread_counts AS (
        SELECT
          m."roomId" AS "roomId",
          COUNT(*)::int AS "unreadCount"
        FROM "Message" m
        JOIN accessible_rooms ar
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
        JOIN accessible_rooms ar
          ON ar."roomId" = m."roomId"
        JOIN "User" u
          ON u.id = m."senderId"
        ORDER BY m."roomId", m."createdAt" DESC
      )
      SELECT
        ar."roomId" AS "roomId",
        COALESCE(uc."unreadCount", 0)::int AS "unreadCount",
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
        roomId: row.roomId,
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
