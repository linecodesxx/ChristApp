import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { normalizeUsernameHandle } from './username.util';

const profileSelect = {
  id: true,
  email: true,
  username: true,
  nickname: true,
  createdAt: true,
  isActive: true,
  avatarUrl: true,
  themeForegroundHex: true,
  themeBackgroundHex: true,
  themeFontKey: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // Получить всех пользователей
  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        nickname: true,
        email: true,
        createdAt: true,
        isActive: true,
        avatarUrl: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Получить одного пользователя по id
  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        nickname: true,
        email: true,
        createdAt: true,
        isActive: true,
        avatarUrl: true,
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

    if (!hasIdentity && !hasAppearance) {
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

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(nextUsername !== undefined ? { username: nextUsername } : {}),
        ...(nextNickname !== undefined ? { nickname: nextNickname } : {}),
        ...(themeFg !== undefined ? { themeForegroundHex: themeFg } : {}),
        ...(themeBg !== undefined ? { themeBackgroundHex: themeBg } : {}),
        ...(themeFont !== undefined ? { themeFontKey: themeFont } : {}),
      },
      select: profileSelect,
    });
  }

  async setAvatarUrl(userId: string, avatarUrl: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: profileSelect,
    });
  }
}
