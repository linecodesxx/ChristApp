/** Нормалізація @username: єдиний вигляд, без конфліктів John / john. */
export function normalizeUsernameHandle(raw: string): string {
  return raw.trim().toLowerCase();
}
