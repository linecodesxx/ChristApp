export const AUTH_CHANGED_EVENT = "christapp-auth-changed";

export const AUTH_COOKIE_NAME = "auth";
export const AUTH_TOKEN_KEY = "token";
export const LEGACY_AUTH_TOKEN_KEY = "jwt";
/**
 * Access token у localStorage — переживає закриття вкладки / PWA (на відміну від sessionStorage).
 * Refresh як і раніше в HttpOnly-cookie; при завершенні access спрацює silent refresh у useAuth.
 */
const ACCESS_TOKEN_STORAGE_KEY = "christ_access_token";
/** Раніше токен лежав лише тут — читаємо для міграції зі старих сесій. */
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
        // ігноруємо quota / private mode
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

/** Запущено як встановлений PWA (standalone / iOS «На екран Додому»). */
export function isPwaStandaloneClient(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const mq = window.matchMedia?.("(display-mode: standalone)");
  if (mq?.matches) {
    return true;
  }
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

/**
 * Чи є збережений access у **localStorage або sessionStorage** (без memory) — той самий порядок, що й у `readStoredAccessToken`.
 * Потрібно для cold start / PWA: токен міг бути лише в сесії до міграції в LS.
 */
export function hasPersistedAccessTokenInWebStorage(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return readStoredAccessToken() != null;
}

/**
 * Чи є на клієнті ознака сесії (access у storage / памʼяті або прапорець `auth=1` після логіну).
 * HttpOnly refresh не читаємо — без цього не варто бити `/auth/refresh` на старті, щоб не ловити 401 у консолі для гостей.
 */
export function hasClientAuthSessionHint(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (getAuthToken()) {
    return true;
  }
  return document.cookie.split(";").some((part) => {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    const name = eq === -1 ? trimmed : trimmed.slice(0, eq).trim();
    const value = eq === -1 ? "" : trimmed.slice(eq + 1).trim();
    return name === AUTH_COOKIE_NAME && value === "1";
  });
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
    // private mode / quota — лишається лише memory + refresh за cookie
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
