import { JwtService } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';

jest.mock(
  'src/messages/messages.service',
  () => ({
    MessagesService: class MessagesService {},
  }),
  { virtual: true },
);

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

jest.mock(
  'src/push/push.service',
  () => ({
    PushService: class PushService {},
  }),
  { virtual: true },
);

type SocketUser = {
  id: string;
  username: string;
  nickname: string;
};

type MockClient = {
  data: {
    user?: SocketUser;
  };
  handshake: {
    auth?: {
      token?: string;
    };
    headers?: {
      authorization?: string;
    };
  };
  emit: jest.Mock;
  join: jest.Mock;
  leave: jest.Mock;
  to: jest.Mock;
  disconnect: jest.Mock;
};

function createClient(user: SocketUser): MockClient {
  return {
    data: { user },
    handshake: {},
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    to: jest.fn(() => ({ emit: jest.fn() })),
    disconnect: jest.fn(),
  };
}

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let prisma: {
    room: { findUnique: jest.Mock };
    roomMember: { findUnique: jest.Mock };
  };
  let messagesService: {
    createRoomMessage: jest.Mock;
    markRoomAsRead: jest.Mock;
    getRoomMessages: jest.Mock;
    deleteOwnGlobalMessage: jest.Mock;
  };
  let pushService: {
    sendChatMessagePush: jest.Mock;
  };
  let roomEmit: jest.Mock;

  beforeEach(() => {
    prisma = {
      room: {
        findUnique: jest.fn(),
      },
      roomMember: {
        findUnique: jest.fn(),
      },
    };

    messagesService = {
      createRoomMessage: jest.fn(),
      markRoomAsRead: jest.fn().mockResolvedValue(undefined),
      getRoomMessages: jest.fn(),
      deleteOwnGlobalMessage: jest.fn(),
    };

    pushService = {
      sendChatMessagePush: jest.fn().mockResolvedValue(undefined),
    };

    gateway = new ChatGateway(
      {} as JwtService,
      prisma as never,
      messagesService as never,
      pushService as never,
    );

    roomEmit = jest.fn();
    (gateway as unknown as { server: unknown }).server = {
      to: jest.fn(() => ({ emit: roomEmit })),
      emit: jest.fn(),
      fetchSockets: jest.fn().mockResolvedValue([]),
    };
  });

  it('delivers latest room history to user on join', async () => {
    const client = createClient({ id: 'u2', username: 'receiver', nickname: 'receiver' });
    const history = [
      {
        id: 'm1',
        content: 'Первое',
        createdAt: new Date('2026-03-13T10:00:00.000Z'),
      },
      {
        id: 'm2',
        content: 'Последнее сообщение',
        createdAt: new Date('2026-03-13T10:01:00.000Z'),
      },
    ];

    prisma.roomMember.findUnique.mockResolvedValue({ userId: 'u2' });
    messagesService.getRoomMessages.mockResolvedValue(history);

    await gateway.handleJoinRoom({ roomId: 'room-1', limit: 50, skip: 0 }, client as never);

    const roomHistoryCall = client.emit.mock.calls.find(
      ([eventName]: [string]) => eventName === 'roomHistory',
    );

    expect(roomHistoryCall).toBeDefined();
    expect(roomHistoryCall?.[1]?.messages?.at(-1)?.content).toBe(
      'Последнее сообщение',
    );
    expect(messagesService.markRoomAsRead).toHaveBeenCalledWith(
      'room-1',
      'u2',
      expect.any(Date),
    );
  });

  it('sends message to room and triggers push for recipient', async () => {
    const sender = { id: 'u1', username: 'sender', nickname: 'sender' };
    const client = createClient(sender);
    const savedMessage = {
      id: 'm3',
      content: 'Свежое сообщение для получателя',
      createdAt: new Date('2026-03-13T10:02:00.000Z'),
      senderId: 'u1',
      sender: {
        username: 'sender',
        nickname: 'sender',
      },
    };

    prisma.roomMember.findUnique.mockResolvedValue({ userId: 'u1' });
    messagesService.createRoomMessage.mockResolvedValue(savedMessage);

    await gateway.handleMessage(
      { roomId: 'room-1', content: 'Свежое сообщение для получателя' },
      client as never,
    );

    expect(messagesService.createRoomMessage).toHaveBeenCalledWith(
      'Свежое сообщение для получателя',
      'u1',
      'room-1',
    );

    expect(roomEmit).toHaveBeenCalledWith('newMessage', {
      id: 'm3',
      content: 'Свежое сообщение для получателя',
      username: 'sender',
      handle: 'sender',
      senderId: 'u1',
      createdAt: savedMessage.createdAt,
      roomId: 'room-1',
    });

    expect(pushService.sendChatMessagePush).toHaveBeenCalledWith({
      roomId: 'room-1',
      senderId: 'u1',
      senderUsername: 'sender',
      content: 'Свежое сообщение для получателя',
      createdAt: savedMessage.createdAt,
    });
  });

  it('does not send message when user has no room access', async () => {
    const sender = { id: 'u1', username: 'sender', nickname: 'sender' };
    const client = createClient(sender);

    prisma.roomMember.findUnique.mockResolvedValue(null);

    await gateway.handleMessage(
      { roomId: 'room-1', content: 'Сообщение' },
      client as never,
    );

    expect(client.emit).toHaveBeenCalledWith('error', 'Нет доступа');
    expect(messagesService.createRoomMessage).not.toHaveBeenCalled();
    expect(pushService.sendChatMessagePush).not.toHaveBeenCalled();
  });

  it('deletes own message in global room and emits messageDeleted', async () => {
    const sender = { id: 'u1', username: 'sender', nickname: 'sender' };
    const client = createClient(sender);

    messagesService.deleteOwnGlobalMessage.mockResolvedValue({
      ok: true,
      messageId: 'm-global-1',
      roomId: '00000000-0000-0000-0000-000000000001',
    });

    await gateway.handleDeleteMessage({ messageId: 'm-global-1' }, client as never);

    expect(messagesService.deleteOwnGlobalMessage).toHaveBeenCalledWith(
      'm-global-1',
      'u1',
      '00000000-0000-0000-0000-000000000001',
    );

    expect(roomEmit).toHaveBeenCalledWith('messageDeleted', {
      messageId: 'm-global-1',
      roomId: '00000000-0000-0000-0000-000000000001',
    });

    expect(client.emit).toHaveBeenCalledWith('deleteMessageResult', {
      ok: true,
      messageId: 'm-global-1',
      roomId: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('rejects delete when message belongs to another user', async () => {
    const sender = { id: 'u1', username: 'sender', nickname: 'sender' };
    const client = createClient(sender);

    messagesService.deleteOwnGlobalMessage.mockResolvedValue({
      ok: false,
      reason: 'not-owner',
    });

    await gateway.handleDeleteMessage({ messageId: 'm-foreign' }, client as never);

    expect(client.emit).toHaveBeenCalledWith('deleteMessageResult', {
      ok: false,
      messageId: 'm-foreign',
      error: 'Можно удалять только свои сообщения',
    });
    expect(roomEmit).not.toHaveBeenCalledWith('messageDeleted', expect.anything());
  });
});
