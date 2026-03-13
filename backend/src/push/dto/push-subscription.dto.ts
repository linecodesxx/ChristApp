import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class PushKeysDto {
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  auth: string;
}

export class RegisterPushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  expirationTime?: number | null;

  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

export class UnsubscribePushSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  endpoint: string;
}
