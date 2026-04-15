const TEST_ACCOUNT_PATTERNS: RegExp[] = [
  /^(autotest|autoui|autoreopen)/i,
  /^test(er)?[\d_-]*/i,
]

export function isTesterUsername(username?: string | null): boolean {
  const value = (username ?? "").trim()
  if (!value) {
    return false
  }
  return TEST_ACCOUNT_PATTERNS.some((pattern) => pattern.test(value))
}

export function filterTesterUsers<T extends { username?: string | null }>(users: T[]): T[] {
  return users.filter((user) => !isTesterUsername(user.username))
}
