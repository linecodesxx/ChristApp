import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async createMessage(content: string, userId: string) {
    return this.prisma.message.create({
      data: {
        content,
        senderId: userId,
      },
      include: {
        sender: true,
      },
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
