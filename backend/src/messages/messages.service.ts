import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

type UnreadRoomSummaryRow = {
  roomId: string;
  unreadCount: number;
};

type RoomUnreadSummary = {
  roomId: string;
  unread: number;
};

export type UnreadSummaryResult = {
  totalUnread: number;
  rooms: RoomUnreadSummary[];
};

@Injectable()
export class MessagesService {
  private readonly GLOBAL_ROOM =
    process.env.GLOBAL_ROOM_ID ?? '00000000-0000-0000-0000-000000000001';

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
    // Один запрос сразу по всем доступным комнатам: быстрее и стабильнее,
    // чем поочередно делать count для каждой комнаты.
    const rows = await this.prisma.$queryRaw<UnreadRoomSummaryRow[]>`
      SELECT
        m."roomId" AS "roomId",
        COUNT(*)::int AS "unreadCount"
      FROM "Message" m
      LEFT JOIN "RoomReadState" rrs
        ON rrs."roomId" = m."roomId"
       AND rrs."userId" = ${userId}
      WHERE m."senderId" <> ${userId}
        AND (
          m."roomId" = ${this.GLOBAL_ROOM}
          OR EXISTS (
            SELECT 1
            FROM "RoomMember" rm
            WHERE rm."roomId" = m."roomId"
              AND rm."userId" = ${userId}
          )
        )
        AND m."createdAt" > COALESCE(rrs."lastReadAt", to_timestamp(0))
      GROUP BY m."roomId"
    `;

    const rooms = rows
      .map((row) => ({
        roomId: row.roomId,
        unread: Number(row.unreadCount) || 0,
      }))
      .filter((row) => row.unread > 0)
      .sort((left, right) => right.unread - left.unread);

    const totalUnread = rooms.reduce((sum, room) => sum + room.unread, 0);

    return {
      totalUnread,
      rooms,
    };
  }

}
