import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

const AVATARS_DIR = join(process.cwd(), 'uploads', 'avatars');

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Расширение для сохранения файла по MIME (любой image/*). */
function extensionForImageMime(mimetype: string): string {
  const known: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/x-ms-bmp': '.bmp',
    'image/x-icon': '.ico',
    'image/vnd.microsoft.icon': '.ico',
    'image/avif': '.avif',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'image/tiff': '.tiff',
    'image/x-tiff': '.tiff',
    'image/jxl': '.jxl',
  };
  const normalized = mimetype.split(';')[0].trim().toLowerCase();
  if (known[normalized]) {
    return known[normalized];
  }
  const parts = normalized.split('/');
  if (parts[0] !== 'image' || !parts[1]) {
    return '.img';
  }
  const sub = parts[1].replace(/^x-/, '');
  const base = sub.split('+')[0].replace(/[^a-z0-9]/gi, '');
  if (!base) {
    return '.img';
  }
  return `.${base.slice(0, 16)}`;
}

function ensureAvatarsDir() {
  if (!existsSync(AVATARS_DIR)) {
    mkdirSync(AVATARS_DIR, { recursive: true });
  }
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: AVATAR_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        const type = (file.mimetype ?? '').split(';')[0].trim().toLowerCase();
        if (type.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(null, false);
        }
      },
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureAvatarsDir();
          cb(null, AVATARS_DIR);
        },
        filename: (req, file, cb) => {
          const user = (req as { user?: { id: string } }).user;
          const ext = extensionForImageMime(file.mimetype ?? 'image/jpeg');
          if (user?.id) {
            try {
              if (existsSync(AVATARS_DIR)) {
                const oldFiles = readdirSync(AVATARS_DIR).filter((name) =>
                  name.startsWith(`${user.id}.`),
                );
                for (const name of oldFiles) {
                  unlinkSync(join(AVATARS_DIR, name));
                }
              }
            } catch {
              // ignore cleanup errors
            }
            cb(null, `${user.id}${ext}`);
            return;
          }
          cb(null, `temp-${Date.now()}${ext}`);
        },
      }),
    }),
  )
  async uploadAvatar(
    @Req() req: { user: { id: string } },
    @UploadedFile() file: { filename: string } | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Нужен файл изображения (любой поддерживаемый браузером формат), до 5 МБ',
      );
    }
    const publicPath = `/uploads/avatars/${file.filename}`;
    return this.usersService.setAvatarUrl(req.user.id, publicPath);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(
    @Req() req: { user: { id: string } },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getAllUsers() {
    return this.usersService.getAllUsers();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getUserById(@Param('id') id: string) {
    return this.usersService.getUserById(id);
  }
}
