import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Легка перевірка «сервер запущено» (холодний старт на хостингу) — без БД і авторизації. */
  @Get('health')
  health(): { ok: true } {
    return { ok: true };
  }
}
