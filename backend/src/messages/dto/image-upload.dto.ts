import { IsNotEmpty, IsString } from 'class-validator';

export class ImageUploadDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;
}
