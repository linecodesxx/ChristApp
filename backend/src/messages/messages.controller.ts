import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  forwardRef,
  Get,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MessagesService } from './messages.service';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { ChatGateway } from 'src/chat/chat.gateway';
import { voiceMessageContent } from './voice-message';
import { VoiceUploadDto } from './dto/voice-upload.dto';
import { ImageUploadDto } from './dto/image-upload.dto';
import { uploadErrorMessage } from 'src/common/upload-error-message';

type AuthenticatedRequest = {
  user?: { id?: string };
};

const VOICE_MIME_ALLOW = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/x-m4a',
  'video/webm',
]);

const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

@Controller('messages')
export class MessagesController {
  private readonly logger = new Logger(MessagesController.name);

  constructor(
    private readonly messagesService: MessagesService,
    private readonly cloudinaryService: CloudinaryService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  getGlobalMessages(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    if (!req.user?.id) {
      throw new UnauthorizedException();
    }
    const parsedLimit = Math.min(
      Math.max(parseInt(limit ?? '50', 10) || 50, 1),
      200,
    );
    const parsedSkip = Math.max(parseInt(skip ?? '0', 10) || 0, 0);
    return this.messagesService.getGlobalRoomMessages(parsedLimit, parsedSkip);
  }

  @UseGuards(JwtAuthGuard)
  @Get('room')
  async getRoomMessages(
    @Req() req: AuthenticatedRequest,
    @Query('roomId') roomId?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const rid = (roomId ?? '').trim();
    if (!rid) {
      throw new BadRequestException('roomId обязателен');
    }

    const mayAccess = await this.messagesService.userCanPostToRoom(userId, rid);
    if (!mayAccess) {
      throw new ForbiddenException('Нет доступа к комнате');
    }

    const parsedLimit = Math.min(
      Math.max(parseInt(limit ?? '250', 10) || 250, 1),
      500,
    );
    const parsedSkip = Math.max(parseInt(skip ?? '0', 10) || 0, 0);
    return this.messagesService.getRoomMessages(rid, parsedLimit, parsedSkip);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body('content') content: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }
    return this.messagesService.createMessage(content, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('voice')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async uploadVoice(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: VoiceUploadDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    if (!this.cloudinaryService.isReady()) {
      throw new ServiceUnavailableException(
        'Загрузка голоса недоступна: задайте CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET в .env (см. backend/.env.example).',
      );
    }

    const rid = body.roomId.trim();
    if (!rid) {
      throw new BadRequestException('roomId обязателен');
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException('Нужен аудиофайл в поле file');
    }

    const mime = (file.mimetype || '').toLowerCase();
    if (!VOICE_MIME_ALLOW.has(mime)) {
      throw new BadRequestException(`Неподдерживаемый тип: ${mime || '—'}`);
    }

    const mayPost = await this.messagesService.userCanPostToRoom(userId, rid);
    if (!mayPost) {
      throw new ForbiddenException('Нет доступа к комнате');
    }

    try {
      const url = await this.cloudinaryService.uploadChatVoice(file.buffer);
      const content = voiceMessageContent(url);
      const message = await this.messagesService.createRoomMessage({
        type: 'VOICE',
        content,
        senderId: userId,
        roomId: rid,
      });
      await this.chatGateway.broadcastNewChatMessage(rid, message);
      return { ok: true, id: message.id, content: message.content };
    } catch (err) {
      this.logger.warn('uploadVoice failed', err);
      const reason = uploadErrorMessage(err);
      throw new ServiceUnavailableException(`Не удалось загрузить голос: ${reason}`);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: IMAGE_MAX_BYTES },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: ImageUploadDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    if (!this.cloudinaryService.isReady()) {
      throw new ServiceUnavailableException(
        'Загрузка изображений недоступна: задайте CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET в .env (см. backend/.env.example).',
      );
    }

    const rid = body.roomId.trim();
    if (!rid) {
      throw new BadRequestException('roomId обязателен');
    }

    if (!file?.buffer?.length) {
      throw new BadRequestException('Нужен файл изображения в поле file');
    }

    const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
    if (!mime.startsWith('image/')) {
      throw new BadRequestException(`Ожидается изображение, получено: ${mime || '—'}`);
    }

    const mayPost = await this.messagesService.userCanPostToRoom(userId, rid);
    if (!mayPost) {
      throw new ForbiddenException('Нет доступа к комнате');
    }

    try {
      const url = await this.cloudinaryService.uploadChatImage(file.buffer);
      const message = await this.messagesService.createRoomMessage({
        type: 'IMAGE',
        fileUrl: url,
        senderId: userId,
        roomId: rid,
      });
      await this.chatGateway.broadcastNewChatMessage(rid, message);
      return {
        ok: true,
        id: message.id,
        type: message.type,
        fileUrl: message.fileUrl,
        content: message.content,
      };
    } catch (err) {
      this.logger.warn('uploadImage failed', err);
      const reason = uploadErrorMessage(err);
      throw new ServiceUnavailableException(`Не удалось загрузить изображение: ${reason}`);
    }
  }
}
