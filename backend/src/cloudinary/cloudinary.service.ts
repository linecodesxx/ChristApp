import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly ready: boolean;

  constructor(private readonly config: ConfigService) {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET')?.trim();

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      this.ready = true;
    } else {
      this.ready = false;
      this.logger.warn(
        'Cloudinary disabled: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.',
      );
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async uploadChatVoice(buffer: Buffer): Promise<string> {
    if (!this.ready) {
      throw new Error('Cloudinary is not configured');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'christapp/chat-voice',
          resource_type: 'auto',
        },
        (err, result) => {
          if (err) {
            reject(err);
            return;
          }
          const url = result?.secure_url;
          if (!url) {
            reject(new Error('Cloudinary returned no URL'));
            return;
          }
          resolve(url);
        },
      );

      Readable.from(buffer).pipe(uploadStream);
    });
  }

  /** Зображення в чат (папка `christapp/chat-images`). */
  async uploadChatImage(buffer: Buffer): Promise<string> {
    if (!this.ready) {
      throw new Error('Cloudinary is not configured');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'christapp/chat-images',
          resource_type: 'image',
          transformation: [
            { width: 1000, crop: 'limit' },
            { quality: 'auto' },
            { fetch_format: 'auto' },
          ],
        },
        (err, result) => {
          if (err) {
            reject(err);
            return;
          }
          const url = result?.secure_url;
          if (!url) {
            reject(new Error('Cloudinary returned no URL'));
            return;
          }
          resolve(url);
        },
      );

      Readable.from(buffer).pipe(uploadStream);
    });
  }

  /** Документи/аудіо-файли в чат (папка `christapp/chat-files`). */
  async uploadChatFile(buffer: Buffer, originalFilename?: string): Promise<string> {
    if (!this.ready) {
      throw new Error('Cloudinary is not configured');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'christapp/chat-files',
          resource_type: 'auto',
          use_filename: true,
          unique_filename: true,
          filename_override: originalFilename,
        },
        (err, result) => {
          if (err) {
            reject(err);
            return;
          }
          const url = result?.secure_url;
          if (!url) {
            reject(new Error('Cloudinary returned no URL'));
            return;
          }
          resolve(url);
        },
      );

      Readable.from(buffer).pipe(uploadStream);
    });
  }

  /**
  * Аватар: один ресурс на користувача (public_id = userId), перезапис при новому завантаженні.
  * У БД зберігається лише secure_url.
   */
  async uploadUserAvatar(buffer: Buffer, userId: string): Promise<string> {
    if (!this.ready) {
      throw new Error('Cloudinary is not configured');
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'christapp/avatars',
          public_id: userId,
          overwrite: true,
          resource_type: 'image',
          transformation: [{ width: 1024, height: 1024, crop: 'limit' }],
        },
        (err, result) => {
          if (err) {
            reject(err);
            return;
          }
          const url = result?.secure_url;
          if (!url) {
            reject(new Error('Cloudinary returned no URL'));
            return;
          }
          resolve(url);
        },
      );

      Readable.from(buffer).pipe(uploadStream);
    });
  }
}
