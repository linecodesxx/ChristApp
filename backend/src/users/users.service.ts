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
    if (dto.username === undefined && dto.nickname === undefined) {
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

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(nextUsername !== undefined ? { username: nextUsername } : {}),
        ...(nextNickname !== undefined ? { nickname: nextNickname } : {}),
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
