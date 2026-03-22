import { ConflictException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto, RegisterDto } from './dto/AuthDTO';
import { Prisma } from '@prisma/client';
import { normalizeUsernameHandle } from 'src/users/username.util';


@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) { }

  async register(dto: RegisterDto) {
    try {
      const hash = await bcrypt.hash(dto.password, 10);
      const nickname = dto.username.trim();
      const username = normalizeUsernameHandle(dto.username);

      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          username,
          nickname,
          password: hash,
          isActive: true
        },
      });

      return this.generateTokenResponse(user.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Пользователь с таким email или username уже существует');
      }

      throw new InternalServerErrorException('Ошибка при регистрации');
    }
  }

  async login(dto: LoginDto) {
    const identifier = dto.email.trim();
    const asEmail = identifier.toLowerCase();
    const asHandle = normalizeUsernameHandle(identifier);

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: asEmail }, { username: asHandle }],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Неверный пароль');
    }

    return this.generateTokenResponse(user.id);
  }

  private async generateTokenResponse(userId: string) {
    const safe = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        createdAt: true,
        isActive: true,
        avatarUrl: true,
      },
    });

    if (!safe) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    const payload = { sub: safe.id, username: safe.username };

    return {
      access_token: this.jwt.sign(payload),
      user: safe,
    };
  }
}
