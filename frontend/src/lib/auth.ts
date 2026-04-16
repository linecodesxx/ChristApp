export const AUTH_CHANGED_EVENT = "christapp-auth-changed"

export const AUTH_TOKEN_KEY = "token"
export const LEGACY_AUTH_TOKEN_KEY = "jwt"
const ACCESS_TOKEN_STORAGE_KEY = "christ_access_token"
const ACCESS_SESSION_LEGACY_KEY = "christ_access_token"

let memoryAccessToken: string | null = null

function normalizeToken(token: string): string {
  return token.replace(/^Bearer\s+/i, "").trim()
}

export function readStoredAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  const fromPersist = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  if (fromPersist) {
    const t = normalizeToken(fromPersist)
    if (t) return t
  }

  const fromSessionLegacy = window.sessionStorage.getItem(ACCESS_SESSION_LEGACY_KEY)
  if (fromSessionLegacy) {
    const t = normalizeToken(fromSessionLegacy)
    if (t) {
      try {
        window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, t)
        window.sessionStorage.removeItem(ACCESS_SESSION_LEGACY_KEY)
      } catch {
        // ignore quota / private mode
      }
      return t
    }
  }

  const legacy =
    window.localStorage.getItem(AUTH_TOKEN_KEY) ??
    window.localStorage.getItem(LEGACY_AUTH_TOKEN_KEY)
  if (legacy) {
    const t = normalizeToken(legacy)
    if (t) return t
  }

  return null
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  if (memoryAccessToken) {
    return memoryAccessToken
  }

  return null
}

export function isPwaStandaloneClient(): boolean {
  if (typeof window === "undefined") {
    return false
  }
  const mq = window.matchMedia?.("(display-mode: standalone)")
  if (mq?.matches) {
    return true
  }
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
}

export function hasPersistedAccessTokenInWebStorage(): boolean {
  if (typeof window === "undefined") {
    return false
  }
  return readStoredAccessToken() != null
}

export function hydrateAuthTokenFromStorage(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  const token = readStoredAccessToken()
  memoryAccessToken = token
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
  return token
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") {
    return
  }

  const normalizedToken = normalizeToken(token)
  memoryAccessToken = normalizedToken
  try {
    window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, normalizedToken)
  } catch {
    // private mode / quota: keep only in memory
  }
  window.sessionStorage.removeItem(ACCESS_SESSION_LEGACY_KEY)
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY)
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") {
    return
  }

  memoryAccessToken = null
  window.sessionStorage.removeItem(ACCESS_SESSION_LEGACY_KEY)
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY)
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY)
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT))
}
