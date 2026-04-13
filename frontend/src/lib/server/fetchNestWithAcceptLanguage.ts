import { getLocale } from "next-intl/server"

/**
 * Базовий origin застосунку для серверних fetch (той самий хост, що й у Next).
 * У проді задайте `NEXT_INTERNAL_APP_ORIGIN` (наприклад https://your-domain.com).
 */
function serverAppOrigin(): string {
  const explicit = process.env.NEXT_INTERNAL_APP_ORIGIN?.trim().replace(/\/+$/, "")
  if (explicit) {
    return explicit
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, "")}`
  }
  return "http://127.0.0.1:3000"
}

/**
 * Приклад запиту до NestJS через проксі Next (`/api/nest/...`) з передачею поточної локалі в `Accept-Language`.
 */
export async function fetchNestWithAcceptLanguage(path: string, init?: RequestInit) {
  const locale = await getLocale()
  const normalized = path.startsWith("/") ? path : `/${path}`
  const url = `${serverAppOrigin()}/api/nest${normalized}`

  const headers = new Headers(init?.headers)
  headers.set("Accept-Language", locale)

  return fetch(url, {
    ...init,
    headers,
    cache: init?.cache ?? "no-store",
  })
}
