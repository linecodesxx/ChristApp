import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminGuard } from './admin.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  /** Усі учасники: максимум полів для огляду в адмінці. */
  @Get('members')
  async listMembers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        createdAt: true,
        isActive: true,
        isVip: true,
        lastSeenAt: true,
        avatarUrl: true,
      },
    });
  }

  @Patch('members/:id/vip')
  async setMemberVip(@Param('id') id: string, @Body() body: { isVip?: boolean }) {
    const isVip = Boolean(body?.isVip);
    return this.prisma.user.update({
      where: { id },
      data: { isVip },
      select: {
        id: true,
        username: true,
        nickname: true,
        isVip: true,
        isActive: true,
        lastSeenAt: true,
      },
    });
  }
}
