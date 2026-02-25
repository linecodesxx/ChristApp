import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthDto } from './dto/AuthDTO';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';

@Controller()
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() dto: AuthDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: AuthDto) {
    return this.authService.login(dto);
  }

  @Get("/auth/me")
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req) {
    return req.user;
}

}
