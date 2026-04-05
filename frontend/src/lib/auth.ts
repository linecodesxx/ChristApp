export const AUTH_CHANGED_EVENT = "christapp-auth-changed";

export const AUTH_COOKIE_NAME = "auth";
export const AUTH_TOKEN_KEY = "token";
export const LEGACY_AUTH_TOKEN_KEY = "jwt";
/** Короткоживущий access token (sessionStorage, не refresh). */
const ACCESS_SESSION_KEY = "christ_access_token";

let memoryAccessToken: string | null = null;

export function isAuthenticated(value: string | undefined): boolean {
  return value === "1";
}

function readStoredAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const fromSession = window.sessionStorage.getItem(ACCESS_SESSION_KEY);
  if (fromSession) {
    const t = fromSession.replace(/^Bearer\s+/i, "").trim();
    if (t) return t;
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
  window.sessionStorage.setItem(ACCESS_SESSION_KEY, normalizedToken);
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  document.cookie = `${AUTH_COOKIE_NAME}=1; Path=/; SameSite=Lax`;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  memoryAccessToken = null;
  window.sessionStorage.removeItem(ACCESS_SESSION_KEY);
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  document.cookie = `${AUTH_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}
