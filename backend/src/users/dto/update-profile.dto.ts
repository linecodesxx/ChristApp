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

  /** Пустая строка — сбросить на дефолт темы приложения. */
  @IsOptional()
  @IsString()
  @Matches(/^(|#[0-9A-Fa-f]{6})$/, {
    message: 'Цвет текста: #RRGGBB или пусто',
  })
  themeForegroundHex?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(|#[0-9A-Fa-f]{6})$/, {
    message: 'Цвет фона: #RRGGBB или пусто',
  })
  themeBackgroundHex?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(|inter|pastah|achiko)$/, {
    message: 'Шрифт: inter, pastah, achiko или пусто',
  })
  themeFontKey?: string;
}
