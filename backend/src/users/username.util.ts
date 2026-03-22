/** Нормализация @username: единый вид, без конфликтов John / john. */
export function normalizeUsernameHandle(raw: string): string {
  return raw.trim().toLowerCase();
}
