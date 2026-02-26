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

interface SocketUser {
  id: string;
  username: string;
  email?: string;
}

interface SocketWithUser extends Socket {
  data: {
    user?: SocketUser;
  };
}

@WebSocketGateway({
  cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Общий чат — это просто комната
  private readonly GLOBAL_ROOM =
    process.env.GLOBAL_ROOM_ID ?? '00000000-0000-0000-0000-000000000001';

  private static readonly DISCONNECT_GRACE_MS = 3000;

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private messagesService: MessagesService,
  ) {}

  // userId → количество активных соединений
  private onlineUsers = new Map<string, number>();

  // таймер для "мягкого" оффлайна (если вкладка быстро перезагружается)
  private pendingDisconnectTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private isAuthError(error: unknown) {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return (
      message.includes('token') ||
      message.includes('jwt') ||
      message.includes('unauthorized') ||
      message.includes('not authorized') ||
      message.includes('user not found') ||
      message.includes('no token provided')
    );
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

      client.data.user = user;
      return user;
    } catch {
      return undefined;
    }
  }

  // ================= CONNECTION =================
  async handleConnection(client: SocketWithUser) {
    try {
      // 1. Берем JWT из handshake
      const authToken = client.handshake.auth?.token;
      const headerAuth = client.handshake.headers?.authorization;
      const token = this.normalizeToken(authToken || headerAuth || '');
      if (!token) throw new Error('No token provided');

      const payload = this.jwt.verify(token);

      // 2. Ищем пользователя в БД
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) throw new Error('User not found');

      // Сохраняем пользователя в сокете
      client.data.user = user;

      console.log('✅ Connected:', user.username);

      try {
        // Подключаем к общему чату
        client.join(this.GLOBAL_ROOM);

        await this.emitMyRooms(client, user.id);

        // Обновляем онлайн-статус
        const userId = user.id;
        const reconnectTimer = this.pendingDisconnectTimers.get(userId);

        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          this.pendingDisconnectTimers.delete(userId);
          this.onlineUsers.set(userId, 1);
        } else {
          const currentConnections = this.onlineUsers.get(userId) || 0;
          this.onlineUsers.set(userId, currentConnections + 1);
        }

        // Рассылаем глобальный онлайн
        this.server.emit('onlineCount', this.onlineUsers.size);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error('[WS] Post-connect initialization error:', reason);
        client.emit('error', 'Ошибка инициализации чата');
      }
    } catch (err: any) {
      const reason = err instanceof Error ? err.message : String(err);
      if (this.isAuthError(err)) {
        console.warn('[WS] Unauthorized socket connection:', reason);
        client.emit('error', 'Не авторизован');
        client.disconnect();
        return;
      }

      console.error('[WS] Unexpected connection error:', reason);
      client.emit('error', 'Ошибка подключения');
    }
  }

  // ================= DISCONNECT =================
  async handleDisconnect(client: SocketWithUser) {
    const user = client.data.user;
    if (!user) return;

    const userId = user.id;
    const currentConnections = this.onlineUsers.get(userId);
    if (!currentConnections) return;

    if (currentConnections === 1) {
      // Ждем немного перед удалением (если вкладка перезагружается)
      const timer = setTimeout(() => {
        this.pendingDisconnectTimers.delete(userId);

        if (this.onlineUsers.get(userId) === 1) {
          this.onlineUsers.delete(userId);
          this.server.emit('onlineCount', this.onlineUsers.size);
        }
      }, ChatGateway.DISCONNECT_GRACE_MS);

      this.pendingDisconnectTimers.set(userId, timer);
    } else {
      this.onlineUsers.set(userId, currentConnections - 1);
      this.server.emit('onlineCount', this.onlineUsers.size);
    }
  }

  // ================= JOIN ROOM =================
  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @MessageBody() body: { roomId: string; limit?: number; skip?: number } | string,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const roomId = typeof body === 'string' ? body : body?.roomId;
    const limit = typeof body === 'string' ? 50 : Math.max(1, Math.min(body?.limit ?? 50, 200));
    const skip = typeof body === 'string' ? 0 : Math.max(0, body?.skip ?? 0);

    if (!roomId) {
      client.emit('error', 'roomId обязателен');
      return;
    }

    try {
      // Проверяем доступ к комнате
      const hasAccess = await this.checkRoomAccess(user.id, roomId);
      if (!hasAccess) {
        client.emit('error', 'Нет доступа');
        return;
      }

      // 🔹 Добавляем сокет в комнату
      await client.join(roomId);

      // 🔹 Отправляем историю комнаты
      const history = await this.messagesService.getRoomMessages(
        roomId,
        limit,
        skip,
      );

      client.emit('roomHistory', {
        roomId,
        messages: history,
      });

      client.to(roomId).emit('userJoinedRoom', {
        roomId,
        userId: user.id,
        username: user.username,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[WS] joinRoom failed:', { roomId, userId: user.id, reason });
      client.emit('error', 'Ошибка загрузки истории');
    }
  }

  // ================= LEAVE ROOM =================
  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = client.data.user;

    // 🔹 Удаляем сокет из комнаты
    await client.leave(roomId);

    if (user) {
      client.to(roomId).emit('userLeftRoom', {
        roomId,
        userId: user.id,
        username: user.username,
      });
    }
  }

  // ================= CREATE PRIVATE ROOM =================
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

  // ================= OPEN DIRECT ROOM =================
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
      select: { id: true, username: true },
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
      targetUsername: targetUser.username,
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

  // ================= INVITE USER TO ROOM =================
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

    const inviterHasAccess = await this.checkRoomAccess(inviter.id, roomId);
    if (!inviterHasAccess) {
      client.emit('error', 'Нет доступа к комнате');
      return;
    }

    const invitedUser = await this.prisma.user.findUnique({
      where: { id: invitedUserId },
      select: { id: true, username: true },
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
      invitedUsername: invitedUser.username,
      invitedByUserId: inviter.id,
      invitedByUsername: inviter.username,
    });

    client.emit('roomUserInvited', {
      roomId,
      userId: invitedUser.id,
      username: invitedUser.username,
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

  // ================= MY ROOMS =================
  @SubscribeMessage('getMyRooms')
  async handleGetMyRooms(@ConnectedSocket() client: SocketWithUser) {
    const user = await this.resolveSocketUser(client);
    if (!user) {
      client.emit('error', 'Не авторизован');
      return;
    }

    await this.emitMyRooms(client, user.id);
  }

  // ================= SEND MESSAGE =================
  @SubscribeMessage('sendMessage')
  async handleMessage(
    @MessageBody() body: { roomId: string; content: string },
    @ConnectedSocket() client: SocketWithUser,
  ) {
    const user = await this.resolveSocketUser(client);
    if (!user) return;

    const { roomId, content } = body;

    // 🔹 Не отправляем пустые сообщения
    if (!content?.trim()) return;

    try {
      // Проверяем доступ к комнате
      const hasAccess = await this.checkRoomAccess(user.id, roomId);
      if (!hasAccess) {
        client.emit('error', 'Нет доступа');
        return;
      }

      // Сохраняем сообщение в БД (источник истины)
      const message = await this.messagesService.createRoomMessage(
        content,
        user.id,
        roomId,
      );

      // Отправляем сообщение только участникам комнаты
      this.server.to(roomId).emit('newMessage', {
        id: message.id,
        content: message.content,
        username: message.sender.username,
        createdAt: message.createdAt,
        roomId,
      });
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

  // ================= ACCESS CHECK =================
  private async checkRoomAccess(userId: string, roomId: string) {
    // К общему чату доступ есть у всех
    if (roomId === this.GLOBAL_ROOM) return true;

    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { members: true },
    });

    if (!room) return false;

    // Проверяем, состоит ли пользователь в комнате
    return room.members.some((m) => m.userId === userId);
  }

  private async emitMyRooms(client: SocketWithUser, userId: string) {
    const rooms = await this.getMyRoomsForUser(userId);
    client.emit('myRooms', { rooms });
  }

  private async getMyRoomsForUser(userId: string) {
    try {
      const hasValidGlobalRoomId = this.isUuid(this.GLOBAL_ROOM);

      const where = hasValidGlobalRoomId
        ? {
            OR: [{ id: this.GLOBAL_ROOM }, { members: { some: { userId } } }],
          }
        : {
            members: { some: { userId } },
          };

      return await this.prisma.room.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          createdAt: true,
        },
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error('[WS] emitMyRooms failed:', reason);
      return [];
    }
  }
}
