const RECENT_AUTH_EMAILS_KEY = "recent_auth_emails"
const RECENT_AUTH_USERNAMES_KEY = "recent_auth_usernames"
const MAX_RECENT_ITEMS = 5

type AuthIdentityInput = {
  email?: string
  username?: string
}

function isBrowser(): boolean {
  return typeof window !== "undefined"
}

function readStoredList(key: string): string[] {
  if (!isBrowser()) {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(key)
    if (!rawValue) {
      return []
    }

    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function writeRecentValue(key: string, value: string, caseInsensitive = false): void {
  if (!isBrowser()) {
    return
  }

  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return
  }

  const existingValues = readStoredList(key)
  const nextValues = [
    normalizedValue,
    ...existingValues.filter((existing) => {
      if (caseInsensitive) {
        return existing.toLowerCase() !== normalizedValue.toLowerCase()
      }
      return existing !== normalizedValue
    }),
  ].slice(0, MAX_RECENT_ITEMS)

  try {
    window.localStorage.setItem(key, JSON.stringify(nextValues))
  } catch {
    // Ignore storage errors (private mode/quota).
  }
}

export function saveRecentAuthIdentity({ email, username }: AuthIdentityInput): void {
  if (email) {
    writeRecentValue(RECENT_AUTH_EMAILS_KEY, email.trim().toLowerCase(), true)
  }

  if (username) {
    writeRecentValue(RECENT_AUTH_USERNAMES_KEY, username.trim())
  }
}

export function getRecentAuthEmails(): string[] {
  return readStoredList(RECENT_AUTH_EMAILS_KEY)
}

export function getRecentAuthUsernames(): string[] {
  return readStoredList(RECENT_AUTH_USERNAMES_KEY)
}
