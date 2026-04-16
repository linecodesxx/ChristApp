import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeUsernameHandle } from 'src/users/username.util';
import { LoginDto, RegisterDto } from './dto/AuthDTO';
import { REFRESH_TOKEN_COOKIE } from './auth.constants';

const USER_SAFE_SELECT = {
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
  isVip: true,
} as const;

const REFRESH_TOKEN_TTL_DAYS = 30;
const ACCESS_TOKEN_TTL = '7d';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function randomRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessExpiresIn: string;
  private readonly refreshTtlMs: number;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {
    this.accessExpiresIn =
      this.config.get<string>('JWT_ACCESS_EXPIRES_IN')?.trim() || ACCESS_TOKEN_TTL;
    const daysRaw = this.config.get<string>('JWT_REFRESH_DAYS')?.trim();
    const days = daysRaw ? Number.parseInt(daysRaw, 10) : REFRESH_TOKEN_TTL_DAYS;
    this.refreshTtlMs =
      (Number.isFinite(days) && days > 0 ? days : REFRESH_TOKEN_TTL_DAYS) *
      24 *
      60 *
      60 *
      1000;
  }

  private isCookieSecure(): boolean {
    if (this.config.get<string>('COOKIE_SECURE') === 'false') {
      return false;
    }
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  private refreshCookieSameSite(): 'none' | 'lax' {
    // SameSite=None requires Secure=true in modern browsers.
    return this.isCookieSecure() ? 'none' : 'lax';
  }

  private refreshCookieOptions(maxAgeMs: number) {
    return {
      httpOnly: true,
      secure: this.isCookieSecure(),
      sameSite: this.refreshCookieSameSite(),
      path: '/',
      maxAge: maxAgeMs,
    };
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      path: '/',
      httpOnly: true,
      secure: this.isCookieSecure(),
      sameSite: this.refreshCookieSameSite(),
    });
  }

  private maskTokenHash(hash: string): string {
    return hash.length > 12 ? `${hash.slice(0, 6)}...${hash.slice(-6)}` : hash;
  }

  private requestMeta(req: Request): string {
    const ip =
      req.ip ||
      (Array.isArray(req.headers['x-forwarded-for'])
        ? req.headers['x-forwarded-for'][0]
        : req.headers['x-forwarded-for']) ||
      'unknown-ip';
    const ua = req.headers['user-agent'] || 'unknown-ua';
    return `ip=${ip}; ua=${ua}`;
  }

  async register(dto: RegisterDto, res: Response) {
    const nickname = dto.username.trim();
    const username = normalizeUsernameHandle(dto.username);

    const usernameTaken = await this.prisma.user.findFirst({
      where: { username },
      select: { id: true },
    });
    if (usernameTaken) {
      throw new ConflictException(
        'Этот username уже занят. Выберите другой @username.',
      );
    }

    try {
      const hash = await bcrypt.hash(dto.password, 10);

      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          username,
          nickname,
          password: hash,
          isActive: true,
        },
      });

      await this.issueRefreshSession(user.id, res);
      return this.buildAccessResponse(user.id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target;
        const fields = Array.isArray(target)
          ? target.map((item) => String(item).toLowerCase())
          : [];
        const hasEmail = fields.some((f) => f.includes('email'));
        const hasUsername = fields.some((f) => f.includes('username'));
        if (hasEmail && hasUsername) {
          throw new ConflictException(
            'Этот email или username уже заняты. Войдите в аккаунт или укажите другие данные.',
          );
        }
        if (hasEmail) {
          throw new ConflictException(
            'Этот email уже зарегистрирован. Войдите или укажите другой email.',
          );
        }
        if (hasUsername) {
          throw new ConflictException(
            'Этот username уже занят. Выберите другой @username.',
          );
        }
        throw new ConflictException(
          'Пользователь с таким email или username уже существует.',
        );
      }

      throw new InternalServerErrorException('Ошибка при регистрации');
    }
  }

  async login(dto: LoginDto, res: Response) {
    const identifier = dto.email.trim();
    const asEmail = identifier.toLowerCase();
    const asHandle = normalizeUsernameHandle(identifier);

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: asEmail }, { username: asHandle }],
      },
    });

    if (!user) {
      this.logger.warn(
        `login failed: account not found for identifier=${identifier}`,
      );
      throw new UnauthorizedException(
        'Аккаунт с таким email или username не найден. Проверьте написание или зарегистрируйтесь.',
      );
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      this.logger.warn(
        `login failed: invalid password for userId=${user.id}; username=${user.username}`,
      );
      throw new UnauthorizedException('Неверный пароль.');
    }

    await this.issueRefreshSession(user.id, res);
    this.logger.log(
      `login success: userId=${user.id}; username=${user.username}; accessTtl=${this.accessExpiresIn}`,
    );
    return this.buildAccessResponse(user.id);
  }

  async refresh(req: Request, res: Response) {
    const meta = this.requestMeta(req);
    const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!raw || typeof raw !== 'string') {
      this.logger.warn(`refresh denied: no refresh cookie; ${meta}`);
      throw new UnauthorizedException();
    }

    const tokenHash = sha256Hex(raw);
    this.logger.log(
      `refresh requested: tokenHash=${this.maskTokenHash(tokenHash)}; ${meta}`,
    );
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
    });

    if (!session || session.expiresAt < new Date()) {
      this.logger.warn(
        `refresh denied: session missing/expired tokenHash=${this.maskTokenHash(tokenHash)}; ${meta}`,
      );
      if (session) {
        await this.prisma.refreshSession.delete({ where: { id: session.id } });
      }
      this.clearRefreshCookie(res);
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, isActive: true },
    });

    if (!user?.isActive) {
      this.logger.warn(
        `refresh denied: inactive userId=${session.userId}; ${meta}`,
      );
      await this.prisma.refreshSession.deleteMany({
        where: { userId: session.userId },
      });
      this.clearRefreshCookie(res);
      throw new UnauthorizedException();
    }

    await this.prisma.refreshSession.delete({ where: { id: session.id } });
    await this.issueRefreshSession(session.userId, res);
    this.logger.log(`refresh success: userId=${session.userId}; ${meta}`);
    return this.buildAccessResponse(session.userId);
  }

  async logout(req: Request, res: Response) {
    const meta = this.requestMeta(req);
    const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (raw && typeof raw === 'string') {
      const tokenHash = sha256Hex(raw);
      await this.prisma.refreshSession.deleteMany({ where: { tokenHash } });
      this.logger.log(
        `logout success: tokenHash=${this.maskTokenHash(tokenHash)}; ${meta}`,
      );
    } else {
      this.logger.log(`logout without cookie; ${meta}`);
    }
    this.clearRefreshCookie(res);
    return { ok: true };
  }

  private async issueRefreshSession(userId: string, res: Response) {
    const raw = randomRefreshToken();
    const tokenHash = sha256Hex(raw);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);

    await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    this.logger.log(
      `issued refresh session: userId=${userId}; tokenHash=${this.maskTokenHash(tokenHash)}; expiresAt=${expiresAt.toISOString()}`,
    );

    res.cookie(
      REFRESH_TOKEN_COOKIE,
      raw,
      this.refreshCookieOptions(this.refreshTtlMs),
    );
  }

  private async buildAccessResponse(userId: string) {
    const safe = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SAFE_SELECT,
    });

    if (!safe) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    const payload = { sub: safe.id, username: safe.username, isVip: Boolean(safe.isVip) };
    this.logger.log(
      `issued access token: userId=${safe.id}; username=${safe.username}; ttl=${this.accessExpiresIn}`,
    );

    return {
      access_token: this.jwt.sign(payload, {
        expiresIn: this.accessExpiresIn as import('jsonwebtoken').SignOptions['expiresIn'],
      }),
      user: safe,
    };
  }
}
