const ADMIN_PANEL_USERNAMES = new Set(["neskai"])

/**
 * Вкладка «Огляд» (/dashboard) у TabBar — для VIP або для логінів зі списку (історично той самий «адмін»-дашборд).
 */
export function canSeeDashboardNav(username: string | undefined | null, isVip?: boolean | null): boolean {
  if (Boolean(isVip)) {
    return true
  }
  const u = username?.trim().toLowerCase()
  return Boolean(u && ADMIN_PANEL_USERNAMES.has(u))
}

/**
 * Сторінка /admin і кнопка в чат-листі — лише для вказаних @username (не для всіх VIP).
 */
export function canSeeAdminPanelNav(username: string | undefined | null): boolean {
  const u = username?.trim().toLowerCase()
  return Boolean(u && ADMIN_PANEL_USERNAMES.has(u))
}
