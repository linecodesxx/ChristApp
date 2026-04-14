/** Логіни (username, lower), яким дозволено адмін-маршрути та кнопку в чат-листі. */
export const ADMIN_DASHBOARD_USERNAMES = new Set(['neskai']);

export function isAdminDashboardUsername(username: string | undefined | null): boolean {
  const u = username?.trim().toLowerCase();
  return Boolean(u && ADMIN_DASHBOARD_USERNAMES.has(u));
}
