import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagesService } from 'src/messages/messages.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { PushService } from 'src/push/push.service';
import { resolveGlobalRoomId } from 'src/config/global-room';
import {
  SHARE_WITH_JESUS_ROOM_PREFIX,
  userMayAccessRoomByTitle,
} from 'src/chat/room-access.util';
import { canUserPostToRoom } from 'src/chat/user-may-post-to-room';
import { MessageType } from '@prisma/client';

interface SocketUser {
  id: string;
  username: string;
  nickname: string;
  email?: string;
}

interface SocketWithUser extends Socket {
  data: {
    user?: SocketUser;
  };
}

type ReactionEventBody = {
  messageId: string;
  type: string;
  chatId: string;
};

type RoomReadStatesPayload = {
  roomId: string;
  readStates: Array<{
    userId: string;
    lastReadAt: string;
  }>;
};

@WebSocketGateway({
  cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Загальний чат — це просто кімната
  private readonly GLOBAL_ROOM = resolveGlobalRoomId();

  private static readonly DISCONNECT_GRACE_MS = 3000;
  private static readonly ALLOWED_REACTIONS = new Set(['🤍', '😂', '❤️', '🔥', '😊', '😧', '🥲']);

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private messagesService: MessagesService,
    private pushService: PushService,
  ) {}

  // userId → кількість активних з'єднань
  private onlineUsers = new Map<string, number>();

  // таймер для "м'якого" офлайну (якщо вкладка швидко перезавантажується)
  private pendingDisconnectTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  private emitOnlinePresence() {
    this.server.emit('onlineCount', this.onlineUsers.size);
    this.server.emit('onlineUsers', {
      userIds: Array.from(this.onlineUsers.keys()),
      count: this.onlineUsers.size,
    });
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private getShareWithJesusRoomTitle(userId: string) {
    return `${SHARE_WITH_JESUS_ROOM_PREFIX}${userId}`;
  }

  private async ensureShareWithJesusRoomForUser(userId: string): Promise<string> {
    const roomTitle = this.getShareWithJesusRoomTitle(userId);

    const room = await this.prisma.room.upsert({
      where: {
        title: roomTitle,
      },
      update: {},
      create: {
        title: roomTitle,
      },
      select: {
        id: true,
      },
    });

    await this.prisma.roomMember.upsert({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId,
        },
      },
      update: {},
      create: {
        roomId: room.id,
        userId,
      },
    });

    return room.id;
  }

  private normalizeToken(tokenCandidate: unknown) {
    if (typeof tokenCandidate !== 'string') return '';
    return tokenCandidate.replace(/^Bearer\s+/i, '').trim();
  }

  private async resolveSocketUser(client: SocketWithUser) {
    if (client.data.user) return client.data.user;

    const authToken = client.handshake.auth?.token;
    const headerAuth = client.handshake.headers?.authorization;
    const token = this.normalizeToken(authToken || headerAuth || '');

    if (!token) return undefined;

    try {
      const payload = this.jwt.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) return undefined;

      // Створюємо об'єкт, що відповідає інтерфейсу SocketUser
      const socketUser = {
        ...user,
        nickname: user.nickname ?? user.username, // Якщо ніка немає, беремо логін
      };

      client.data.user = socketUser;
      return socketUser;
    } catch {
      return undefined;
    }
  }

  // ================= ПІДКЛЮЧЕННЯ =================
  async handleConnection(client: SocketWithUser) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      console.warn('[WS] Unauthorized socket connection');
      client.emit('error', 'Не авторизован');
      client.disconnect();
      return;
    }

    console.log('✅ Connected:', user.username);

    try {
      // Підключаємо до загального чату
      client.join(this.GLOBAL_ROOM);

      await this.emitMyRooms(client, user.id);

      // Оновлюємо онлайн-статус
      const userId = user.id;
      const previousConnections = this.onlineUsers.get(userId) || 0;
      const reconnectTimer = this.pendingDisconnectTimers.get(userId);

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        this.pendingDisconnectTimers.delete(userId);
        this.onlineUsers.set(userId, 1);
      } else {
        this.onlineUsers.set(userId, previousConnections + 1);
      }

      if (previousConnections === 0) {
        this.server.emit('userPresenceChanged', { userId, isOnline: true, lastSeenAt: null });
      }

      // Розсилаємо глобальний онлайн
      this.emitOnlinePresence();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[WS] Post-connect initialization error:', reason);
      client.emit('error', 'Ошибка инициализации чата');
    }
  }

  // ================= RESOLVE SHARE WITH JESUS ROOM =================
  /**
  * Швидко резолвить кімнату «Поділися з Ісусом» для поточного користувача та гарантує членство.
  * Повертає roomId лише власнику (тому інший користувач не зможе отримати чужий roomId через цей метод).
   */
  @SubscribeMessage('resolveShareWithJesusRoomId')
  async handleResolveShareWithJesusRoomId(
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('shareWithJesusRoomIdResolved', { ok: false, roomId: '', error: 'Не авторизован' });
      return;
    }

    const roomTitle = this.getShareWithJesusRoomTitle(user.id);
    const roomId = await this.ensureShareWithJesusRoomForUser(user.id);

    client.emit('shareWithJesusRoomIdResolved', {
      ok: true,
      roomId,
      roomTitle,
    });
  }

  // ================= ВІДКЛЮЧЕННЯ =================
  async handleDisconnect(client: SocketWithUser) {
    const user = client.data.user;
    if (!user) return;

    const userId = user.id;
    const currentConnections = this.onlineUsers.get(userId);
    if (!currentConnections) return;

    if (currentConnections === 1) {
      // Трохи чекаємо перед видаленням (якщо вкладка перезавантажується)
      const timer = setTimeout(() => {
        this.pendingDisconnectTimers.delete(userId);

        if (this.onlineUsers.get(userId) === 1) {
          this.onlineUsers.delete(userId);
          this.server.emit('userPresenceChanged', {
            userId,
            isOnline: false,
            lastSeenAt: new Date().toISOString(),
          });
          this.emitOnlinePresence();
        }
      }, ChatGateway.DISCONNECT_GRACE_MS);

      this.pendingDisconnectTimers.set(userId, timer);
    } else {
      this.onlineUsers.set(userId, currentConnections - 1);
      this.emitOnlinePresence();
    }
  }

  // ================= ПРИЄДНАННЯ ДО КІМНАТИ =================
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody()
    body: { roomId: string; limit?: number; skip?: number } | string,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const roomId = typeof body === 'string' ? body : body?.roomId;
    const limit =
      typeof body === 'string'
        ? 50
        : Math.max(1, Math.min(body?.limit ?? 50, 200));
    const skip = typeof body === 'string' ? 0 : Math.max(0, body?.skip ?? 0);

    if (!roomId) {
      client.emit('error', 'roomId обязателен');
      return;
    }

    try {
      // Перевіряємо доступ до кімнати
      const hasAccess = await canUserPostToRoom(this.prisma, user.id, roomId);
      if (!hasAccess) {
        client.emit('error', 'Нет доступа');
        return;
      }

      // 🔹 Додаємо сокет у кімнату
      await client.join(roomId);

      // 🔹 Надсилаємо історію кімнати
      const history = await this.messagesService.getRoomMessages(
        roomId,
        limit,
        skip,
      );

      const readStates = await this.prisma.roomReadState.findMany({
        where: { roomId },
        select: {
          userId: true,
          lastReadAt: true,
        },
      });

      // Кімната відкрита у користувача: вважаємо поточний зріз прочитаним.
      const readAt = new Date();
      await this.messagesService.markRoomAsRead(roomId, user.id, readAt);
      client.to(roomId).emit('roomReadUpdated', {
        roomId,
        userId: user.id,
        lastReadAt: readAt.toISOString(),
      });

      client.emit('roomHistory', {
        roomId,
        messages: history,
      });

      client.emit('roomReadStates', {
        roomId,
        readStates: [
          ...readStates
            .filter((item) => item.userId !== user.id)
            .map((item) => ({
              userId: item.userId,
              lastReadAt: item.lastReadAt.toISOString(),
            })),
          {
            userId: user.id,
            lastReadAt: readAt.toISOString(),
          },
        ],
      } satisfies RoomReadStatesPayload);

      client.to(roomId).emit('userJoinedRoom', {
        roomId,
        userId: user.id,
        username: user.nickname || user.username,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[WS] joinRoom failed:', {
        roomId,
        userId: user.id,
        reason,
      });
      client.emit('error', 'Ошибка загрузки истории');
    }
  }

  @SubscribeMessage('markRoomRead')
  async handleMarkRoomRead(
    @MessageBody() body: { roomId: string } | string,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      return;
    }

    const roomId = typeof body === 'string' ? body : body?.roomId;
    if (!roomId) {
      client.emit('error', 'roomId обязателен');
      return;
    }

    const hasAccess = await canUserPostToRoom(this.prisma, user.id, roomId);
    if (!hasAccess) {
      client.emit('error', 'Нет доступа');
      return;
    }

    const readAt = new Date();
    await this.messagesService.markRoomAsRead(roomId, user.id, readAt);
    client.to(roomId).emit('roomReadUpdated', {
      roomId,
      userId: user.id,
      lastReadAt: readAt.toISOString(),
    });
  }

  @SubscribeMessage('roomTyping')
  async handleRoomTyping(
    @MessageBody()
    body: { roomId: string; isTyping: boolean; activity?: 'text' | 'voice' },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!roomId) return;

    const hasAccess = await canUserPostToRoom(this.prisma, user.id, roomId);
    if (!hasAccess) return;

    client.to(roomId).emit('userTyping', {
      roomId,
      userId: user.id,
      username: user.nickname || user.username,
      handle: user.username,
      isTyping: Boolean(body?.isTyping),
      activity: body?.activity === 'voice' ? 'voice' : 'text',
    });
  }

  // ================= ВИХІД ІЗ КІМНАТИ =================
  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = client.data.user;

    // 🔹 Видаляємо сокет із кімнати
    await client.leave(roomId);

    if (user) {
      client.to(roomId).emit('userLeftRoom', {
        roomId,
        userId: user.id,
        username: user.nickname || user.username,
      });
    }
  }

  /** Видалити себе з кімнати (приватні чати та інші, окрім загального і «Поділися з Ісусом»). */
  @SubscribeMessage('removeSelfFromRoom')
  async handleRemoveSelfFromRoom(
    @MessageBody() body: { roomId: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('removeSelfFromRoomResult', {
        ok: false,
        error: 'Не авторизован',
      });
      return;
    }

    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    if (!roomId) {
      client.emit('removeSelfFromRoomResult', {
        ok: false,
        error: 'roomId обязателен',
      });
      return;
    }

    if (roomId === this.GLOBAL_ROOM) {
      client.emit('removeSelfFromRoomResult', {
        ok: false,
        error: 'Общий чат нельзя удалить',
      });
      return;
    }

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, title: true },
    });

    if (!room) {
      client.emit('removeSelfFromRoomResult', {
        ok: false,
        error: 'Комната не найдена',
      });
      return;
    }

    if (room.title.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)) {
      client.emit('removeSelfFromRoomResult', {
        ok: false,
        error: 'Этот чат нельзя удалить из списка',
      });
      return;
    }

    const member = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId: user.id,
        },
      },
    });

    if (!member) {
      client.emit('removeSelfFromRoomResult', {
        ok: false,
        error: 'Нет доступа к чату',
      });
      return;
    }

    await this.prisma.roomMember.delete({
      where: {
        roomId_userId: {
          roomId,
          userId: user.id,
        },
      },
    });

    await this.prisma.roomReadState.deleteMany({
      where: { roomId, userId: user.id },
    });

    await client.leave(roomId);

    client.emit('removeSelfFromRoomResult', {
      ok: true,
      roomId,
    });

    await this.emitMyRooms(client, user.id);
  }

  // ================= СТВОРЕННЯ ПРИВАТНОЇ КІМНАТИ =================
  @SubscribeMessage('createPrivateRoom')
  async handleCreatePrivateRoom(
    @MessageBody() body: { title: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('error', 'Не авторизован');
      return;
    }

    const title = body?.title?.trim();
    if (!title) {
      client.emit('error', 'Название комнаты обязательно');
      return;
    }

    const existingRoom = await this.prisma.room.findUnique({
      where: { title },
      select: { id: true, title: true },
    });

    if (existingRoom) {
      client.emit('roomExists', {
        roomId: existingRoom.id,
        title: existingRoom.title,
      });
      return;
    }

    const room = await this.prisma.room.create({
      data: {
        title,
        members: {
          create: {
            userId: user.id,
          },
        },
      },
    });

    await client.join(room.id);

    client.emit('roomCreated', {
      roomId: room.id,
      title: room.title,
    });

    await this.emitMyRooms(client, user.id);
  }

  // ================= ВІДКРИТТЯ DIRECT-КІМНАТИ =================
  @SubscribeMessage('openDirectRoom')
  async handleOpenDirectRoom(
    @MessageBody() body: { targetUserId: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('error', 'Не авторизован');
      return;
    }

    const targetUserId = body?.targetUserId;
    if (!targetUserId) {
      client.emit('error', 'targetUserId обязателен');
      return;
    }

    if (targetUserId === user.id) {
      client.emit('error', 'Нельзя создать чат с собой');
      return;
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, username: true, nickname: true },
    });

    if (!targetUser) {
      client.emit('error', 'Пользователь не найден');
      return;
    }

    const [idA, idB] = [user.id, targetUser.id].sort();
    const title = `dm:${idA}:${idB}`;

    let room = await this.prisma.room.findUnique({
      where: { title },
      select: { id: true, title: true },
    });

    if (!room) {
      room = await this.prisma.room.create({
        data: {
          title,
          members: {
            create: [{ userId: user.id }, { userId: targetUser.id }],
          },
        },
        select: { id: true, title: true },
      });
    } else {
      await this.prisma.roomMember.upsert({
        where: {
          roomId_userId: {
            roomId: room.id,
            userId: user.id,
          },
        },
        update: {},
        create: {
          roomId: room.id,
          userId: user.id,
        },
      });

      await this.prisma.roomMember.upsert({
        where: {
          roomId_userId: {
            roomId: room.id,
            userId: targetUser.id,
          },
        },
        update: {},
        create: {
          roomId: room.id,
          userId: targetUser.id,
        },
      });
    }

    await client.join(room.id);

    client.emit('directRoomOpened', {
      roomId: room.id,
      title: room.title,
      targetUserId: targetUser.id,
      targetUsername: targetUser.nickname || targetUser.username,
    });

    await this.emitMyRooms(client, user.id);

    const sockets = await this.server.fetchSockets();
    for (const socket of sockets) {
      if (socket.data?.user?.id === targetUser.id) {
        const rooms = await this.getMyRoomsForUser(targetUser.id);
        socket.emit('myRooms', { rooms });
      }
    }
  }

  // ================= ЗАПРОШЕННЯ КОРИСТУВАЧА ДО КІМНАТИ =================
  @SubscribeMessage('inviteUserToRoom')
  async handleInviteUserToRoom(
    @MessageBody() body: { roomId: string; userId: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const inviter = await this.resolveSocketUser(client);
    if (!inviter) {
      client.emit('error', 'Не авторизован');
      return;
    }

    const roomId = body?.roomId;
    const invitedUserId = body?.userId;

    if (!roomId || !invitedUserId) {
      client.emit('error', 'roomId и userId обязательны');
      return;
    }

    if (roomId === this.GLOBAL_ROOM) {
      client.emit('error', 'В глобальный чат приглашение не требуется');
      return;
    }

    const roomMeta = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { title: true },
    });

    if (!roomMeta) {
      client.emit('error', 'Комната не найдена');
      return;
    }

    if (roomMeta.title.startsWith('dm:')) {
      client.emit('error', 'В личный чат нельзя приглашать других пользователей');
      return;
    }

    if (roomMeta.title.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)) {
      client.emit('error', 'В этот чат нельзя приглашать других пользователей');
      return;
    }

    const inviterHasAccess = await canUserPostToRoom(this.prisma, inviter.id, roomId);
    if (!inviterHasAccess) {
      client.emit('error', 'Нет доступа к комнате');
      return;
    }

    const invitedUser = await this.prisma.user.findUnique({
      where: { id: invitedUserId },
      select: { id: true, username: true, nickname: true },
    });

    if (!invitedUser) {
      client.emit('error', 'Пользователь не найден');
      return;
    }

    const existingMember = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId: invitedUser.id,
        },
      },
    });

    if (existingMember) {
      client.emit('roomMemberExists', {
        roomId,
        userId: invitedUser.id,
      });
      return;
    }

    await this.prisma.roomMember.create({
      data: {
        roomId,
        userId: invitedUser.id,
      },
    });

    this.server.to(roomId).emit('userInvitedToRoom', {
      roomId,
      invitedUserId: invitedUser.id,
      invitedUsername: invitedUser.nickname || invitedUser.username,
      invitedByUserId: inviter.id,
      invitedByUsername: inviter.nickname || inviter.username,
    });

    client.emit('roomUserInvited', {
      roomId,
      userId: invitedUser.id,
      username: invitedUser.nickname || invitedUser.username,
    });

    const sockets = await this.server.fetchSockets();
    for (const socket of sockets) {
      if (socket.data?.user?.id === invitedUser.id) {
        socket.emit('userInvitedToRoom', {
          roomId,
          invitedUserId: invitedUser.id,
        });
      }
    }
  }

  // ================= МОЇ КІМНАТИ =================
  @SubscribeMessage('getMyRooms')
  async handleGetMyRooms(@ConnectedSocket() client: SocketWithUser) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('error', 'Не авторизован');
      return;
    }

    await this.emitMyRooms(client, user.id);
  }

  // ================= НАДСИЛАННЯ ПОВІДОМЛЕННЯ =================
  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() body: { roomId: string; content: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const { roomId, content } = body;

    if (!roomId) {
      client.emit('error', 'roomId обязателен');
      return;
    }

    // Не надсилаємо порожні повідомлення
    if (!content?.trim()) return;

    try {
      const hasAccess = await canUserPostToRoom(this.prisma, user.id, roomId);
      if (!hasAccess) {
        client.emit('error', 'Нет доступа');
        return;
      }

      const message = await this.messagesService.createRoomMessage({
        type: 'TEXT',
        content: content.trim(),
        senderId: user.id,
        roomId,
      });

      await this.broadcastNewChatMessage(roomId, message);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[WS] sendMessage failed:', {
        roomId,
        userId: user.id,
        reason,
      });
      client.emit('error', 'Ошибка сохранения сообщения');
    }
  }

  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(
    @MessageBody() body: { messageId: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('deleteMessageResult', {
        ok: false,
        messageId: '',
        error: 'Не авторизован',
      });
      return;
    }

    const messageId = body?.messageId?.trim();
    if (!messageId) {
      client.emit('deleteMessageResult', {
        ok: false,
        messageId: '',
        error: 'messageId обязателен',
      });
      return;
    }

    try {
      const result = await this.messagesService.deleteOwnMessage(messageId, user.id);

      if (!result.ok) {
        const errorMessage =
          result.reason === 'not-found'
            ? 'Сообщение не найдено'
            : result.reason === 'not-owner'
              ? 'Можно удалять только свои сообщения'
              : result.reason === 'no-access'
                ? 'Нет доступа к этому чату'
                : 'Не удалось удалить сообщение';

        client.emit('deleteMessageResult', {
          ok: false,
          messageId,
          error: errorMessage,
        });
        return;
      }

      this.server.to(result.roomId).emit('messageDeleted', {
        messageId: result.messageId,
        roomId: result.roomId,
      });

      client.emit('deleteMessageResult', {
        ok: true,
        messageId: result.messageId,
        roomId: result.roomId,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[WS] deleteMessage failed:', {
        messageId,
        userId: user.id,
        reason,
      });

      client.emit('deleteMessageResult', {
        ok: false,
        messageId,
        error: 'Ошибка удаления сообщения',
      });
    }
  }

  @SubscribeMessage('toggle-reaction')
  async handleReaction(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() data: ReactionEventBody,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('error', 'Не авторизован');
      return;
    }

    const messageId = typeof data?.messageId === 'string' ? data.messageId.trim() : '';
    const chatId = typeof data?.chatId === 'string' ? data.chatId.trim() : '';
    const type = typeof data?.type === 'string' ? data.type.trim() : '';

    if (!messageId || !chatId || !type) {
      client.emit('error', 'messageId, chatId и type обязательны');
      return;
    }

    if (!ChatGateway.ALLOWED_REACTIONS.has(type)) {
      client.emit('error', 'Неподдерживаемая реакция');
      return;
    }

    const hasAccess = await canUserPostToRoom(this.prisma, user.id, chatId);
    if (!hasAccess) {
      client.emit('error', 'Нет доступа');
      return;
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, roomId: true },
    });

    if (!message || message.roomId !== chatId) {
      client.emit('error', 'Сообщение не найдено');
      return;
    }

    const existing = await this.prisma.reaction.findFirst({
      where: { userId: user.id, messageId, type },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.reaction.create({
        data: { userId: user.id, messageId, type },
      });
    }

    const updatedReactions = await this.prisma.reaction.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        userId: true,
        type: true,
        createdAt: true,
      },
    });

    this.server.to(chatId).emit('update-message-reactions', {
      messageId,
      reactions: updatedReactions,
    });
  }

  /**
  * Після збереження повідомлення в БД: read receipt, сокет і push (як при sendMessage).
   */
  async broadcastNewChatMessage(
    roomId: string,
    message: {
      id: string;
      type: MessageType;
      content: string | null;
      fileUrl: string | null;
      createdAt: Date;
      senderId: string;
      sender: { username: string; nickname: string | null };
    },
  ) {
    await this.messagesService.markRoomAsRead(
      roomId,
      message.senderId,
      message.createdAt,
    );

    this.server.to(roomId).emit('newMessage', {
      id: message.id,
      content: message.content ?? '',
      type: message.type,
      fileUrl: message.fileUrl ?? undefined,
      username: message.sender.nickname || message.sender.username,
      handle: message.sender.username,
      senderId: message.senderId,
      createdAt: message.createdAt,
      roomId,
      reactions: [],
    });

    void this.pushService
      .sendChatMessagePush({
        messageId: message.id,
        roomId,
        senderId: message.senderId,
        senderUsername: message.sender.nickname || message.sender.username,
        content: message.content ?? '',
        messageType: message.type,
        fileUrl: message.fileUrl,
        createdAt: message.createdAt,
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        console.error('[Push] sendChatMessagePush failed:', {
          roomId,
          userId: message.senderId,
          reason,
        });
      });
  }

  private async emitMyRooms(client: SocketWithUser, userId: string) {
    const rooms = await this.getMyRoomsForUser(userId);
    client.emit('myRooms', { rooms });
  }

  private async getMyRoomsForUser(userId: string) {
    try {
      await this.ensureShareWithJesusRoomForUser(userId);

      const hasValidGlobalRoomId = this.isUuid(this.GLOBAL_ROOM);

      const where = hasValidGlobalRoomId
        ? {
            OR: [{ id: this.GLOBAL_ROOM }, { members: { some: { userId } } }],
          }
        : {
            members: { some: { userId } },
          };

      const rooms = await this.prisma.room.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          createdAt: true,
          members: {
            where: {
              userId: {
                not: userId,
              },
            },
            select: {
              user: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                  avatarUrl: true,
                },
              },
            },
            take: 1,
          },
        },
      });

      return rooms
        .filter(
          (room) =>
            room.id === this.GLOBAL_ROOM ||
            userMayAccessRoomByTitle(userId, room.title),
        )
        .map((room) => {
          const directPeer = room.members[0]?.user;
          return {
            id: room.id,
            title: room.title,
            createdAt: room.createdAt,
            ...(directPeer
              ? {
                  directPeer: {
                    id: directPeer.id,
                    username: directPeer.username,
                    nickname: directPeer.nickname,
                    avatarUrl: directPeer.avatarUrl,
                  },
                }
              : {}),
          };
        });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[WS] emitMyRooms failed:', reason);
      return [];
    }
  }
}
