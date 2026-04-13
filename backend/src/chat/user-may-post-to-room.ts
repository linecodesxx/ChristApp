import type { PrismaService } from 'src/prisma/prisma.service';
import { resolveGlobalRoomId } from 'src/config/global-room';
import { userMayAccessRoomByTitle } from 'src/chat/room-access.util';

/** Користувач може надсилати повідомлення в кімнату (загальний чат або учасник з доступом за title). */
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
