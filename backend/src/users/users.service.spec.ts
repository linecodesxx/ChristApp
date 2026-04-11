import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateProfile @username', () => {
    it('throws ConflictException when normalized username belongs to another user', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'other-user' });

      await expect(
        service.updateProfile('me', { username: 'Busy_Handle' }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates profile when username is not taken by others', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({
        id: 'me',
        username: 'free_handle',
        email: 'a@b.c',
        nickname: 'n',
        createdAt: new Date(),
        isActive: true,
        avatarUrl: null,
        themeForegroundHex: null,
        themeBackgroundHex: null,
        themeFontKey: null,
      });

      await service.updateProfile('me', { username: 'Free_Handle' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'me' },
          data: expect.objectContaining({ username: 'free_handle' }),
        }),
      );
    });

    it('throws ConflictException on P2002 from DB (гонка двух запросов)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const dup = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '0',
        meta: { modelName: 'User', target: ['username'] },
      });
      prisma.user.update.mockRejectedValue(dup);

      await expect(
        service.updateProfile('me', { username: 'same_time' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
