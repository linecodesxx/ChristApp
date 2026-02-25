import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MessagesService } from 'src/messages/messages.service';
import { PrismaService } from 'src/prisma/prisma.service';

@WebSocketGateway({
  cors: { origin: '*' }, // для теста можно '*' или укажи свой фронтенд
})
export class ChatGateway {
  @WebSocketServer()
  server: Server;

  private static readonly DISCONNECT_GRACE_MS = 3000;

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private messagesService: MessagesService,
  ) {}

  private onlineUsers = new Map<string, number>();
  private pendingDisconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // При подключении проверяем токен и сохраняем пользователя
  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;
      if (!token) throw new Error("No token provided");

      const payload = this.jwt.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) throw new Error("User not found");

      client.data.user = user;
      console.log("✅ Connected:", user.username);

      // Сразу слать историю сообщений
      const messages = await this.messagesService.getAll();
      // client.emit(
      //   "history",
      //   messages.map((m) => ({
      //     id: m.id,
      //     content: m.content,
      //     username: m.sender.username, // гарантированно есть
      //     createdAt: m.createdAt,
      //   })),
      // );
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

      this.server.emit("onlineCount", this.onlineUsers.size);
      client.emit("onlineCount", this.onlineUsers.size);

      console.log("MAP AFTER CONNECT:", this.onlineUsers);
      console.log("SIZE:", this.onlineUsers.size);
      
    } catch (err: any) {
      console.error("❌ Connection error:", err.message);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user;
    if (!user) return;

    const userId = user.id;
    const currentConnections = this.onlineUsers.get(userId);

    if (!currentConnections) return;

    if (currentConnections === 1) {
      const existingTimer = this.pendingDisconnectTimers.get(userId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        this.pendingDisconnectTimers.delete(userId);

        if (this.onlineUsers.get(userId) === 1) {
          this.onlineUsers.delete(userId);
          this.server.emit("onlineCount", this.onlineUsers.size);
          console.log("❌ Disconnected:", user.username);
        }
      }, ChatGateway.DISCONNECT_GRACE_MS);

      this.pendingDisconnectTimers.set(userId, timer);
    } else {
      this.onlineUsers.set(userId, currentConnections - 1);
      this.server.emit("onlineCount", this.onlineUsers.size);
      console.log("❌ Disconnected:", user.username);
    }
}



  // Отправка нового сообщения
  @SubscribeMessage("sendMessage")
  async handleMessage(
    @MessageBody() content: string,
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user;
    if (!user) return;

    const message = await this.messagesService.createMessage(content, user.id);

    // Шлем всем клиентам уже готовый объект с username
    this.server.emit("newMessage", {
      id: message.id,
      content: message.content,
      username: message.sender.username, // гарантированно
      createdAt: message.createdAt,
    });
  }
}
