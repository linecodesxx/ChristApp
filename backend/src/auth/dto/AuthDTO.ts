import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString({ message: 'Введите email или username' })
  @MinLength(3, { message: 'Введите email или username' })
  email: string;

  @IsString({ message: 'Пароль обязателен' })
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  @MaxLength(72, { message: 'Пароль не должен превышать 72 символа' })
  password: string;
}

export class RegisterDto {
  @IsEmail({}, { message: 'Введите корректный email' })
  email: string;

  @IsString({ message: 'Пароль обязателен' })
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  @MaxLength(72, { message: 'Пароль не должен превышать 72 символа' })
  password: string;

  @IsString({ message: 'Username обязателен' })
  @MinLength(3, { message: 'Username должен быть не короче 3 символов' })
  @MaxLength(20, { message: 'Username не должен превышать 20 символов' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username может содержать только латиницу, цифры и _',
  })
  username: string;
}
