import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import { PushService } from './push.service';

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

type PrismaMock = {
  room: {
    findUnique: jest.Mock;
  };
  user: {
    findMany: jest.Mock;
  };
  roomMember: {
    findMany: jest.Mock;
  };
  pushSubscription: {
    count: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
};

const GLOBAL_ROOM = '00000000-0000-0000-0000-000000000001';

function createPrismaMock(): PrismaMock {
  return {
    room: {
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    roomMember: {
      findMany: jest.fn(),
    },
    pushSubscription: {
      count: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
}

function createConfigMock(): Pick<ConfigService, 'get'> {
  return {
    get: jest.fn((key: string) => {
      if (key === 'WEB_PUSH_PUBLIC_KEY') return 'public-key';
      if (key === 'WEB_PUSH_PRIVATE_KEY') return 'private-key';
      if (key === 'WEB_PUSH_SUBJECT') return 'mailto:test@example.com';
      return undefined;
    }),
  };
}

describe('PushService', () => {
  let prisma: PrismaMock;
  let config: Pick<ConfigService, 'get'>;
  let service: PushService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    config = createConfigMock();
    service = new PushService(prisma as never, config as ConfigService);

    (webPush.sendNotification as jest.Mock).mockResolvedValue(undefined);
    prisma.pushSubscription.update.mockResolvedValue({});
    prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('sends global chat push with normalized latest message body', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u2' }, { id: 'u3' }]);
    prisma.room.findUnique.mockResolvedValue({ title: 'global-chat' });
    prisma.pushSubscription.findMany.mockResolvedValue([
      {
        id: 's2',
        userId: 'u2',
        endpoint: 'https://example.com/u2',
        p256dh: 'k1',
        auth: 'a1',
      },
      {
        id: 's3',
        userId: 'u3',
        endpoint: 'https://example.com/u3',
        p256dh: 'k2',
        auth: 'a2',
      },
    ]);

    await service.sendChatMessagePush({
      roomId: GLOBAL_ROOM,
      senderId: 'u1',
      senderUsername: 'sender',
      content: '[[reply:{"id":"msg-1"}]]   Последнее   сообщение  ',
      createdAt: new Date('2026-03-13T10:00:00.000Z'),
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          not: 'u1',
        },
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    expect(webPush.sendNotification).toHaveBeenCalledTimes(2);

    const firstPayload = JSON.parse(
      (webPush.sendNotification as jest.Mock).mock.calls[0][1],
    );

    expect(firstPayload.body).toBe('Последнее сообщение');
    expect(firstPayload.title).toBe('Новое сообщение в общем чате');
    expect(firstPayload.targetUrl).toBe('/chat/global');
    expect(firstPayload.roomId).toBe(GLOBAL_ROOM);
  });

  it('sends direct message push only to recipient without duplicates', async () => {
    prisma.roomMember.findMany.mockResolvedValue([
      { userId: 'u2' },
      { userId: 'u2' },
      { userId: 'u2' },
    ]);
    prisma.room.findUnique.mockResolvedValue({ title: 'dm:u1:u2' });
    prisma.pushSubscription.findMany.mockResolvedValue([
      {
        id: 's2',
        userId: 'u2',
        endpoint: 'https://example.com/u2',
        p256dh: 'k1',
        auth: 'a1',
      },
    ]);

    await service.sendChatMessagePush({
      roomId: 'room-dm',
      senderId: 'u1',
      senderUsername: 'sender',
      content: 'Привет, это последнее сообщение',
      createdAt: new Date('2026-03-13T10:01:00.000Z'),
    });

    expect(prisma.roomMember.findMany).toHaveBeenCalledWith({
      where: {
        roomId: 'room-dm',
        userId: {
          not: 'u1',
        },
      },
      select: {
        userId: true,
      },
    });

    const findManyArg = prisma.pushSubscription.findMany.mock.calls[0][0];
    expect(findManyArg.where.userId.in).toEqual(['u2']);

    expect(webPush.sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(
      (webPush.sendNotification as jest.Mock).mock.calls[0][1],
    );

    expect(payload.targetUrl).toBe('/chat/u1');
    expect(payload.title).toBe('Новое сообщение от sender');
    expect(payload.body).toBe('Привет, это последнее сообщение');
  });

  it('deletes expired subscription when push endpoint is gone', async () => {
    prisma.roomMember.findMany.mockResolvedValue([{ userId: 'u2' }]);
    prisma.room.findUnique.mockResolvedValue({ title: 'dm:u1:u2' });
    prisma.pushSubscription.findMany.mockResolvedValue([
      {
        id: 's2',
        userId: 'u2',
        endpoint: 'https://example.com/u2',
        p256dh: 'k1',
        auth: 'a1',
      },
    ]);
    (webPush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 });

    await service.sendChatMessagePush({
      roomId: 'room-dm',
      senderId: 'u1',
      senderUsername: 'sender',
      content: 'Проверка',
      createdAt: new Date('2026-03-13T10:02:00.000Z'),
    });

    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: {
        endpoint: 'https://example.com/u2',
      },
    });
  });
});
