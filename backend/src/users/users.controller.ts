import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Req,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { uploadErrorMessage } from 'src/common/upload-error-message';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: AVATAR_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        const type = (file.mimetype ?? '').split(';')[0].trim().toLowerCase();
        if (type.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(null, false);
        }
      },
    }),
  )
  async uploadAvatar(
    @Req() req: { user: { id: string } },
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!this.cloudinaryService.isReady()) {
      throw new ServiceUnavailableException(
        'Загрузка аватара недоступна: задайте CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET в .env (см. backend/.env.example).',
      );
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException(
        'Нужен файл изображения (любой поддерживаемый браузером формат), до 5 МБ',
      );
    }

    try {
      const url = await this.cloudinaryService.uploadUserAvatar(
        file.buffer,
        req.user.id,
      );
      return this.usersService.setAvatarUrl(req.user.id, url);
    } catch (err) {
      this.logger.warn('uploadAvatar failed', err);
      const reason = uploadErrorMessage(err);
      throw new ServiceUnavailableException(
        `Не удалось загрузить аватар: ${reason}`,
      );
    }
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
