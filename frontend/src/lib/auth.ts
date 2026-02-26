export const AUTH_COOKIE_NAME = "auth";
export const AUTH_TOKEN_KEY = "token";
export const LEGACY_AUTH_TOKEN_KEY = "jwt";

export function isAuthenticated(value: string | undefined): boolean {
  return value === "1";
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawToken =
    window.localStorage.getItem(AUTH_TOKEN_KEY) ??
    window.localStorage.getItem(LEGACY_AUTH_TOKEN_KEY);

  if (!rawToken) {
    return null;
  }

  const token = rawToken.replace(/^Bearer\s+/i, "").trim();
  return token || null;
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedToken = token.replace(/^Bearer\s+/i, "").trim();
  window.localStorage.setItem(AUTH_TOKEN_KEY, normalizedToken);
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  document.cookie = `${AUTH_COOKIE_NAME}=1; Path=/; SameSite=Lax`;
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  document.cookie = `${AUTH_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
}