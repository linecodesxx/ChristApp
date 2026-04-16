import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { normalizeUsernameHandle } from './username.util';

const profileSelect = {
  id: true,
  email: true,
  username: true,
  nickname: true,
  createdAt: true,
  lastSeenAt: true,
  isActive: true,
  avatarUrl: true,
  themeForegroundHex: true,
  themeBackgroundHex: true,
  themeFontKey: true,
  bio: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // Отримати всіх користувачів
  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        nickname: true,
        email: true,
        createdAt: true,
        lastSeenAt: true,
        isActive: true,
        avatarUrl: true,
        bio: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Отримати одного користувача за id
  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        nickname: true,
        email: true,
        createdAt: true,
        lastSeenAt: true,
        isActive: true,
        avatarUrl: true,
        bio: true,
      },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const hasIdentity =
      dto.username !== undefined || dto.nickname !== undefined;
    const hasAppearance =
      dto.themeForegroundHex !== undefined ||
      dto.themeBackgroundHex !== undefined ||
      dto.themeFontKey !== undefined;
    const hasBio = dto.bio !== undefined;

    if (!hasIdentity && !hasAppearance && !hasBio) {
      throw new BadRequestException('Нет данных для обновления');
    }

    const nextUsername =
      dto.username !== undefined
        ? normalizeUsernameHandle(dto.username)
        : undefined;
    const nextNickname =
      dto.nickname !== undefined ? dto.nickname.trim() : undefined;

    if (nextNickname !== undefined && !nextNickname) {
      throw new BadRequestException('Ник не может быть пустым');
    }

    if (nextUsername !== undefined) {
      const taken = await this.prisma.user.findFirst({
        where: { username: nextUsername, NOT: { id: userId } },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('Этот @username уже занят');
      }
    }

    const themeFg =
      dto.themeForegroundHex === undefined
        ? undefined
        : dto.themeForegroundHex === null || dto.themeForegroundHex === ''
          ? null
          : dto.themeForegroundHex;
    const themeBg =
      dto.themeBackgroundHex === undefined
        ? undefined
        : dto.themeBackgroundHex === null || dto.themeBackgroundHex === ''
          ? null
          : dto.themeBackgroundHex;
    const themeFont =
      dto.themeFontKey === undefined
        ? undefined
        : dto.themeFontKey === null || dto.themeFontKey === ''
          ? null
          : dto.themeFontKey;

    const nextBio =
      dto.bio === undefined
        ? undefined
        : dto.bio.trim() === ''
          ? null
          : dto.bio.trim();

    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(nextUsername !== undefined ? { username: nextUsername } : {}),
          ...(nextNickname !== undefined ? { nickname: nextNickname } : {}),
          ...(themeFg !== undefined ? { themeForegroundHex: themeFg } : {}),
          ...(themeBg !== undefined ? { themeBackgroundHex: themeBg } : {}),
          ...(themeFont !== undefined ? { themeFontKey: themeFont } : {}),
          ...(nextBio !== undefined ? { bio: nextBio } : {}),
        },
        select: profileSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target;
        const fields = Array.isArray(target)
          ? target.map((item) => String(item).toLowerCase())
          : [];
        if (fields.some((f) => f.includes('username'))) {
          throw new ConflictException('Этот @username уже занят');
        }
      }
      throw error;
    }
  }

  async setAvatarUrl(userId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: profileSelect,
    });
  }

  async getAvatarLikesReceivedCount(targetUserId: string) {
    const count = await this.prisma.avatarLike.count({
      where: { targetUserId },
    });
    return { receivedCount: count };
  }

  async getAvatarLikeState(targetUserId: string, viewerId: string) {
    const [receivedCount, existing] = await Promise.all([
      this.prisma.avatarLike.count({ where: { targetUserId } }),
      this.prisma.avatarLike.findUnique({
        where: {
          targetUserId_likerUserId: { targetUserId, likerUserId: viewerId },
        },
      }),
    ]);
    return {
      receivedCount: receivedCount,
      likedByMe: Boolean(existing),
    };
  }

  async toggleAvatarLike(targetUserId: string, likerUserId: string) {
    if (targetUserId === likerUserId) {
      throw new BadRequestException('Нельзя лайкнуть свой аватар');
    }

    const targetExists = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!targetExists) {
      throw new NotFoundException('Пользователь не найден');
    }

    const existing = await this.prisma.avatarLike.findUnique({
      where: {
        targetUserId_likerUserId: { targetUserId, likerUserId },
      },
    });

    if (existing) {
      await this.prisma.avatarLike.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.avatarLike.create({
        data: { targetUserId, likerUserId },
      });
    }

    return this.getAvatarLikeState(targetUserId, likerUserId);
  }
}
