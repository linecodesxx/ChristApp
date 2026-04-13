const PROXY_PATH = "/api/nest"

/**
 * База для HTTP до Nest (fetch із браузера).
 * Рекомендовано: у кожному середовищі задати `NEXT_PUBLIC_API_URL` (локально `http://localhost:3001`,
 * на проді `https://api...`) і налаштувати `CORS_ORIGIN` на бекенді під origin фронтенду.
 * Якщо змінну не задано — відносний `/api/nest` (проксі у `next.config`, CORS для fetch не потрібен).
 */
export function getHttpApiBase(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/+$/, "")
  }
  return PROXY_PATH
}

/**
 * Реальний хост Nest: WebSocket (Socket.io) і випадки, коли потрібен абсолютний origin.
 * При HTTP-проксі задайте `NEXT_PUBLIC_WS_URL`, якщо API не на 127.0.0.1:3001.
 */
export function getDirectApiOrigin(): string {
  const ws = process.env.NEXT_PUBLIC_WS_URL?.trim()
  if (ws) {
    return ws.replace(/\/+$/, "")
  }
  const api = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (api) {
    return api.replace(/\/+$/, "")
  }
  return "http://127.0.0.1:3001"
}
