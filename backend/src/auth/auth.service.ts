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
  bio: true,
} as const;

const REFRESH_TOKEN_TTL_DAYS = 7;
const REFRESH_ROTATION_GRACE_MS = 30_000;
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

    this.logger.log(
      `auth config: accessTtl=${this.accessExpiresIn}; refreshTtlMs=${this.refreshTtlMs}; cookieSecure=${this.isCookieSecure()}; nodeEnv=${this.config.get<string>('NODE_ENV') ?? 'unknown'}`,
    );
  }

  private isCookieSecure(): boolean {
    if (this.config.get<string>('COOKIE_SECURE') === 'false') {
      return false;
    }
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  /** Refresh cookie: httpOnly, secure in prod (or COOKIE_SECURE), SameSite=Lax, path=/, maxAge from JWT_REFRESH_DAYS. */
  private refreshCookieOptions(maxAgeMs: number) {
    return {
      httpOnly: true,
      secure: this.isCookieSecure(),
      sameSite: 'lax' as const,
      path: '/',
      maxAge: maxAgeMs,
    };
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_TOKEN_COOKIE, {
      path: '/',
      httpOnly: true,
      secure: this.isCookieSecure(),
      sameSite: 'lax',
    });
  }

  private maskTokenHash(hash: string): string {
    return hash.length > 12 ? `${hash.slice(0, 6)}...${hash.slice(-6)}` : hash;
  }

  private requestMeta(req: Request): string {
    const method = req.method || 'UNKNOWN';
    const url = req.originalUrl || req.url || 'unknown-url';
    const ip =
      req.ip ||
      (Array.isArray(req.headers['x-forwarded-for'])
        ? req.headers['x-forwarded-for'][0]
        : req.headers['x-forwarded-for']) ||
      'unknown-ip';
    const ua = req.headers['user-agent'] || 'unknown-ua';
    const origin = req.headers.origin || 'no-origin';
    const referer = req.headers.referer || 'no-referer';
    const host = req.headers.host || 'no-host';
    const forwardedHost = req.headers['x-forwarded-host'] || 'no-x-forwarded-host';
    const secFetchSite = req.headers['sec-fetch-site'] || 'no-sec-fetch-site';
    const cookieHeaderPresent = typeof req.headers.cookie === 'string' && req.headers.cookie.length > 0;
    return `method=${method}; url=${url}; ip=${ip}; host=${host}; xForwardedHost=${forwardedHost}; origin=${origin}; referer=${referer}; secFetchSite=${secFetchSite}; cookieHeaderPresent=${cookieHeaderPresent}; ua=${ua}`;
  }

  private requestCookieInfo(req: Request): string {
    const cookieNames = Object.keys(req.cookies ?? {});
    const hasRefreshCookie = Boolean(req.cookies?.[REFRESH_TOKEN_COOKIE]);
    return `cookieNames=[${cookieNames.join(',')}]; hasRefreshCookie=${hasRefreshCookie}`;
  }

  async register(dto: RegisterDto, res: Response, req?: Request) {
    const meta = req ? this.requestMeta(req) : 'meta=not-provided';
    const nickname = dto.username.trim();
    const username = normalizeUsernameHandle(dto.username);
    this.logger.log(
      `register attempt: email=${dto.email.trim().toLowerCase()}; username=${username}; ${meta}`,
    );

    const usernameTaken = await this.prisma.user.findFirst({
      where: { username },
      select: { id: true },
    });
    if (usernameTaken) {
      this.logger.warn(
        `register denied: username taken username=${username}; ${meta}`,
      );
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

      this.logger.log(
        `register success: userId=${user.id}; username=${user.username}; ${meta}`,
      );

      await this.issueRefreshSession(user.id, res);
      return this.buildAccessResponse(user.id);
    } catch (error) {
      this.logger.error(
        `register failed: username=${username}; ${meta}; reason=${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
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

  async login(dto: LoginDto, res: Response, req?: Request) {
    const meta = req ? this.requestMeta(req) : 'meta=not-provided';
    const identifier = dto.email.trim();
    const asEmail = identifier.toLowerCase();
    const asHandle = normalizeUsernameHandle(identifier);
    this.logger.log(
      `login attempt: identifier=${identifier}; asEmail=${asEmail}; asHandle=${asHandle}; ${meta}`,
    );

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: asEmail }, { username: asHandle }],
      },
    });

    if (!user) {
      this.logger.warn(
        `login failed: account not found for identifier=${identifier}; ${meta}`,
      );
      throw new UnauthorizedException(
        'Аккаунт с таким email или username не найден. Проверьте написание или зарегистрируйтесь.',
      );
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      this.logger.warn(
        `login failed: invalid password for userId=${user.id}; username=${user.username}; ${meta}`,
      );
      throw new UnauthorizedException('Неверный пароль.');
    }

    await this.issueRefreshSession(user.id, res);
    this.logger.log(
      `login success: userId=${user.id}; username=${user.username}; accessTtl=${this.accessExpiresIn}; ${meta}`,
    );
    return this.buildAccessResponse(user.id);
  }

  async refresh(req: Request, res: Response) {
    const meta = this.requestMeta(req);
    const cookieInfo = this.requestCookieInfo(req);
    const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!raw || typeof raw !== 'string') {
      this.logger.warn(`refresh denied: no refresh cookie; ${cookieInfo}; ${meta}`);
      throw new UnauthorizedException();
    }

    const tokenHash = sha256Hex(raw);
    this.logger.log(
      `refresh requested: tokenHash=${this.maskTokenHash(tokenHash)}; ${cookieInfo}; ${meta}`,
    );

    const cleanup = await this.prisma.refreshSession.deleteMany({
      where: {
        isRevoked: true,
        revokedAt: {
          lt: new Date(Date.now() - REFRESH_ROTATION_GRACE_MS),
        },
      },
    });
    if (cleanup.count > 0) {
      this.logger.log(
        `refresh cleanup: deletedRevokedSessions=${cleanup.count}; ${meta}`,
      );
    }

    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash },
    });

    if (!session) {
      this.logger.warn(
        `refresh denied: session missing tokenHash=${this.maskTokenHash(tokenHash)}; ${meta}`,
      );
      this.clearRefreshCookie(res);
      throw new UnauthorizedException();
    }

    this.logger.log(
      `refresh session found: sessionId=${session.id}; userId=${session.userId}; isRevoked=${session.isRevoked}; expiresAt=${session.expiresAt.toISOString()}; revokedAt=${session.revokedAt?.toISOString() ?? 'null'}; ${meta}`,
    );

    if (session.expiresAt < new Date()) {
      this.logger.warn(
        `refresh denied: session expired tokenHash=${this.maskTokenHash(tokenHash)}; ${meta}`,
      );
      await this.prisma.refreshSession.delete({ where: { id: session.id } }).catch(() => undefined);
      this.clearRefreshCookie(res);
      throw new UnauthorizedException();
    }

    if (session.isRevoked) {
      const revokedAt = session.revokedAt?.getTime() ?? 0;
      const inGrace =
        session.graceAccessToken &&
        revokedAt > 0 &&
        Date.now() - revokedAt <= REFRESH_ROTATION_GRACE_MS;

      if (inGrace) {
        const activeUser = await this.prisma.user.findUnique({
          where: { id: session.userId },
          select: { id: true, isActive: true },
        });
        if (!activeUser?.isActive) {
          this.logger.warn(
            `refresh denied: inactive userId=${session.userId} (grace replay); ${meta}`,
          );
          await this.prisma.refreshSession.deleteMany({
            where: { userId: session.userId },
          });
          this.clearRefreshCookie(res);
          throw new UnauthorizedException();
        }

        const safe = await this.prisma.user.findUnique({
          where: { id: session.userId },
          select: USER_SAFE_SELECT,
        });
        if (!safe) {
          this.clearRefreshCookie(res);
          throw new UnauthorizedException();
        }

        this.logger.log(
          `refresh grace replay: userId=${session.userId}; tokenHash=${this.maskTokenHash(tokenHash)}; ${meta}`,
        );
        return {
          access_token: session.graceAccessToken as string,
          user: safe,
        };
      }

      this.logger.warn(
        `refresh denied: revoked past grace tokenHash=${this.maskTokenHash(tokenHash)}; ${meta}`,
      );
      await this.prisma.refreshSession.delete({ where: { id: session.id } }).catch(() => undefined);
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

    const accessPayload = await this.buildAccessResponse(session.userId);

    const rotated = await this.prisma.refreshSession.updateMany({
      where: { id: session.id, isRevoked: false },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        graceAccessToken: accessPayload.access_token,
      },
    });

    if (rotated.count === 0) {
      this.logger.warn(
        `refresh rotate race: update skipped for sessionId=${session.id}; tokenHash=${this.maskTokenHash(tokenHash)}; ${meta}`,
      );
      const again = await this.prisma.refreshSession.findUnique({
        where: { tokenHash },
      });
      const ra = again?.revokedAt?.getTime() ?? 0;
      const replayOk =
        again?.isRevoked &&
        again.graceAccessToken &&
        ra > 0 &&
        Date.now() - ra <= REFRESH_ROTATION_GRACE_MS;

      if (replayOk) {
        const safe = await this.prisma.user.findUnique({
          where: { id: again.userId },
          select: USER_SAFE_SELECT,
        });
        if (!safe) {
          this.clearRefreshCookie(res);
          throw new UnauthorizedException();
        }
        this.logger.log(
          `refresh concurrent replay: userId=${again.userId}; tokenHash=${this.maskTokenHash(tokenHash)}; ${meta}`,
        );
        return {
          access_token: again.graceAccessToken as string,
          user: safe,
        };
      }

      this.clearRefreshCookie(res);
      throw new UnauthorizedException();
    }

    await this.issueRefreshSession(session.userId, res);
    this.logger.log(`refresh success: userId=${session.userId}; ${meta}`);
    return accessPayload;
  }

  async logout(req: Request, res: Response) {
    const meta = this.requestMeta(req);
    const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (raw && typeof raw === 'string') {
      const tokenHash = sha256Hex(raw);
      const deleted = await this.prisma.refreshSession.deleteMany({ where: { tokenHash } });
      this.logger.log(
        `logout success: tokenHash=${this.maskTokenHash(tokenHash)}; deletedSessions=${deleted.count}; ${meta}`,
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

    const created = await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    this.logger.log(
      `issued refresh session: sessionId=${created.id}; userId=${userId}; tokenHash=${this.maskTokenHash(tokenHash)}; expiresAt=${expiresAt.toISOString()}; cookieSameSite=lax; cookieSecure=${this.isCookieSecure()}; cookieMaxAgeMs=${this.refreshTtlMs}`,
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
    const signedToken = this.jwt.sign(payload, {
      expiresIn: this.accessExpiresIn as import('jsonwebtoken').SignOptions['expiresIn'],
    });
    const decoded = this.jwt.decode(signedToken) as
      | { exp?: number; iat?: number }
      | null;
    const expIso =
      typeof decoded?.exp === 'number'
        ? new Date(decoded.exp * 1000).toISOString()
        : 'unknown';

    this.logger.log(
      `issued access token: userId=${safe.id}; username=${safe.username}; ttl=${this.accessExpiresIn}; expAt=${expIso}`,
    );

    return {
      access_token: signedToken,
      user: safe,
    };
  }
}
