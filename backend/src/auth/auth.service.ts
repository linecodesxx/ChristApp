import { ConflictException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthDto } from './dto/AuthDTO';
import { Prisma } from '@prisma/client';


@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: AuthDto) {
    try {
      const hash = await bcrypt.hash(dto.password, 10);

      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          username: dto.username,
          password: hash,
        },
      });

      return this.generateToken(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Пользователь с таким email или username уже существует');
      }

      throw new InternalServerErrorException('Ошибка при регистрации');
    }
  }

  async login(dto: AuthDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException();

    return this.generateToken(user);
  }

  private generateToken(user) {
    const payload = { sub: user.id, username: user.username };

    return {
      access_token: this.jwt.sign(payload),
    };
  }
}
