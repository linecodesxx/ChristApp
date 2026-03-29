import type { PrismaService } from 'src/prisma/prisma.service';
import { resolveGlobalRoomId } from 'src/config/global-room';
import { userMayAccessRoomByTitle } from 'src/chat/room-access.util';

/** Пользователь может отправлять сообщения в комнату (общий чат или участник с доступом по title). */
export async function canUserPostToRoom(
  prisma: PrismaService,
  userId: string,
  roomId: string,
): Promise<boolean> {
  const globalRoom = resolveGlobalRoomId();
  if (roomId === globalRoom) {
    return true;
  }

  const membership = await prisma.roomMember.findUnique({
    where: {
      roomId_userId: {
        roomId,
        userId,
      },
    },
    select: { userId: true },
  });

  if (!membership) {
    return false;
  }

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { title: true },
  });

  if (!room) {
    return false;
  }

  return userMayAccessRoomByTitle(userId, room.title);
}
