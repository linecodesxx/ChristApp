const PROXY_PATH = "/api/nest"

/**
 * База для HTTP к Nest (fetch из браузера).
 * Рекомендуется: в каждой среде задать `NEXT_PUBLIC_API_URL` (локально `http://localhost:3001`,
 * на проде `https://api...`) и настроить `CORS_ORIGIN` на бэкенде под origin фронта.
 * Если переменная не задана — относительный `/api/nest` (прокси в `next.config`, CORS для fetch не нужен).
 */
export function getHttpApiBase(): string {
  const explicit = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/+$/, "")
  }
  return PROXY_PATH
}

/**
 * Реальный хост Nest: WebSocket (Socket.io) и случаи, когда нужен абсолютный origin.
 * При прокси HTTP задайте `NEXT_PUBLIC_WS_URL`, если API не на 127.0.0.1:3001.
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
