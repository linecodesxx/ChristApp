export const AUTH_CHANGED_EVENT = "christapp-auth-changed";

export const AUTH_COOKIE_NAME = "auth";
export const AUTH_TOKEN_KEY = "token";
export const LEGACY_AUTH_TOKEN_KEY = "jwt";
/**
 * Access token в localStorage — переживает закрытие вкладки / PWA (в отличие от sessionStorage).
 * Refresh по-прежнему в HttpOnly-куке; при истечении access сработает silent refresh в useAuth.
 */
const ACCESS_TOKEN_STORAGE_KEY = "christ_access_token";
/** Раньше токен лежал только здесь — читаем для миграции со старых сессий. */
const ACCESS_SESSION_LEGACY_KEY = "christ_access_token";

let memoryAccessToken: string | null = null;

export function isAuthenticated(value: string | undefined): boolean {
  return value === "1";
}

function readStoredAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const fromPersist = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  if (fromPersist) {
    const t = fromPersist.replace(/^Bearer\s+/i, "").trim();
    if (t) return t;
  }

  const fromSessionLegacy = window.sessionStorage.getItem(ACCESS_SESSION_LEGACY_KEY);
  if (fromSessionLegacy) {
    const t = fromSessionLegacy.replace(/^Bearer\s+/i, "").trim();
    if (t) {
      try {
        window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, t);
        window.sessionStorage.removeItem(ACCESS_SESSION_LEGACY_KEY);
      } catch {
        // ignore quota / private mode
      }
      return t;
    }
  }

  const legacy =
    window.localStorage.getItem(AUTH_TOKEN_KEY) ??
    window.localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);
  if (legacy) {
    const t = legacy.replace(/^Bearer\s+/i, "").trim();
    if (t) return t;
  }

  return null;
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (memoryAccessToken) {
    return memoryAccessToken;
  }

  const token = readStoredAccessToken();
  return token || null;
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedToken = token.replace(/^Bearer\s+/i, "").trim();
  memoryAccessToken = normalizedToken;
  try {
    window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, normalizedToken);
  } catch {
    // private mode / quota — остаётся только memory + refresh по cookie
  }
  window.sessionStorage.removeItem(ACCESS_SESSION_LEGACY_KEY);
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  document.cookie = `${AUTH_COOKIE_NAME}=1; Path=/; SameSite=Lax; Max-Age=31536000`;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  memoryAccessToken = null;
  window.sessionStorage.removeItem(ACCESS_SESSION_LEGACY_KEY);
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  document.cookie = `${AUTH_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}
