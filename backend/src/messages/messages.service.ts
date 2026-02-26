import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

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

}
