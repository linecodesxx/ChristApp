import { IsNotEmpty, IsString } from 'class-validator';

export class VoiceUploadDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;
}
