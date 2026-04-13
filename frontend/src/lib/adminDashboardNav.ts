const ADMIN_DASHBOARD_USERNAMES = new Set(["neskai"])

/**
 * Вкладка «Огляд» (dashboard) у TabBar і маршрут /dashboard — лише для вказаних @username.
 */
export function canSeeAdminDashboardNav(username: string | undefined | null): boolean {
  const u = username?.trim().toLowerCase()
  return Boolean(u && ADMIN_DASHBOARD_USERNAMES.has(u))
}
