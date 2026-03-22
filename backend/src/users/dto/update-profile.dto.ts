import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Username: 3–20 символов' })
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Только латиница, цифры и _',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Введите ник' })
  @MaxLength(40)
  nickname?: string;
}
