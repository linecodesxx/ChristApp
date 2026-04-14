import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { isAdminDashboardUsername } from 'src/config/admin-dashboard';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const username = req.user?.username as string | undefined;
    if (!isAdminDashboardUsername(username)) {
      throw new ForbiddenException('Admin only');
    }
    return true;
  }
}
