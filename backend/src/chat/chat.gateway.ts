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

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private messagesService: MessagesService,
  ) {}

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
      client.emit(
        "history",
        messages.map((m) => ({
          id: m.id,
          content: m.content,
          username: m.sender.username, // гарантированно есть
          createdAt: m.createdAt,
        })),
      );
    } catch (err: any) {
      console.error("❌ Connection error:", err.message);
      client.disconnect();
    }
  }

  // Получение истории сообщений по запросу
  @SubscribeMessage("getHistory")
  async handleGetHistory(@ConnectedSocket() client: Socket) {
    const messages = await this.messagesService.getAll();
    client.emit(
      "history",
      messages.map((m) => ({
        id: m.id,
        content: m.content,
        username: m.sender.username,
        createdAt: m.createdAt,
      })),
    );
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
