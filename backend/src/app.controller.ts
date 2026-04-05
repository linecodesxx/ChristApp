import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Лёгкая проверка «сервер поднялся» (холодный старт на хостинге) — без БД и авторизации. */
  @Get('health')
  health(): { ok: true } {
    return { ok: true };
  }
}
