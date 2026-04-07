const ADMIN_DASHBOARD_USERNAMES = new Set(["neskai"])

/**
 * Вкладка «Обзор» (dashboard) в TabBar и маршрут /dashboard — только для указанных @username.
 */
export function canSeeAdminDashboardNav(username: string | undefined | null): boolean {
  const u = username?.trim().toLowerCase()
  return Boolean(u && ADMIN_DASHBOARD_USERNAMES.has(u))
}
