import { getBackendInternalHttpBase } from "@/lib/apiBase"
import axios, { type AxiosHeaders } from "axios"
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

export type FetchNestWithAcceptLanguageOptions = {
  /**
   * Якщо true — запит напряму на Nest (`BACKEND_PROXY_TARGET` / внутрішня база), без `/api/nest`.
   * Для SSR health-check: інакше Next dev логує «Failed to proxy», коли порт 3001 ще закритий.
   */
  directToNest?: boolean
}

/**
 * Приклад запиту до NestJS з передачею поточної локалі в `Accept-Language`.
 * За замовчуванням — через проксі Next (`/api/nest/...`); з `directToNest` — прямий HTTP до бекенду (SSR).
 */
export async function fetchNestWithAcceptLanguage(
  path: string,
  init?: RequestInit,
  options?: FetchNestWithAcceptLanguageOptions,
) {
  const locale = await getLocale()
  const normalized = path.startsWith("/") ? path : `/${path}`
  const url = options?.directToNest
    ? `${getBackendInternalHttpBase()}${normalized}`
    : `${serverAppOrigin()}/api/nest${normalized}`

  const headers = new Headers(init?.headers)
  headers.set("Accept-Language", locale)
  const plain: Record<string, string> = {}
  headers.forEach((v, k) => {
    plain[k] = v
  })
  if ((init?.cache ?? "no-store") === "no-store") {
    plain["Cache-Control"] = "no-store"
  }

  const method = (init?.method ?? "GET").toUpperCase()
  const r = await axios.request<ArrayBuffer>({
    url,
    method,
    headers: plain,
    data: init?.body ?? undefined,
    responseType: "arraybuffer",
    validateStatus: () => true,
    timeout: 15_000,
  })

  const outHeaders = new Headers()
  const raw = r.headers
  const flat =
    raw && typeof (raw as AxiosHeaders).toJSON === "function"
      ? ((raw as AxiosHeaders).toJSON() as Record<string, unknown>)
      : (raw as unknown as Record<string, unknown>) ?? {}
  for (const [key, val] of Object.entries(flat)) {
    if (val === undefined || val === null) continue
    if (Array.isArray(val)) {
      val.forEach((v) => outHeaders.append(key, String(v)))
    } else {
      outHeaders.set(key, String(val))
    }
  }

  return new Response(r.data.byteLength ? r.data : null, {
    status: r.status,
    statusText: String(r.statusText ?? ""),
    headers: outHeaders,
  })
}
