import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { isAdminDashboardUsername } from 'src/config/admin-dashboard';
import { PrismaService } from 'src/prisma/prisma.service';
import { AdminGuard } from './admin.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeUsername(value: string | null | undefined): string {
    return value?.trim().toLowerCase() ?? '';
  }

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

  @Delete('members/:id')
  async deleteMember(@Param('id') id: string, @Req() req: Request) {
    const actor = req.user as { id?: string; username?: string } | undefined;
    if (!id?.trim()) {
      throw new BadRequestException('Member id is required');
    }

    if (!actor?.id) {
      throw new ForbiddenException('Invalid admin session');
    }

    if (actor.id === id) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, email: true },
    });

    if (!target) {
      throw new NotFoundException('Member not found');
    }

    const targetUsername = this.normalizeUsername(target.username);
    if (targetUsername && isAdminDashboardUsername(targetUsername)) {
      throw new ForbiddenException('Cannot delete another admin account');
    }

    await this.prisma.user.delete({ where: { id: target.id } });
    return {
      id: target.id,
      username: target.username,
      email: target.email,
      deleted: true,
    };
  }
}
