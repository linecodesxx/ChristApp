import axios, {
  Axios,
  type AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosError,
  type Method,
} from "axios"
import { isUnauthorizedAuthError, logout, refreshToken } from "@/lib/authSession"

export type ApiFetchInit = RequestInit & {
  /** Таймаут для холодного старту / «засинаючого» API (AbortError при перевищенні). */
  timeoutMs?: number
  /** Внутренний флаг: уже был refresh+retry для этого запроса. */
  _authRetryAttempted?: boolean
}

function headersInitToPlain(headersInit: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!headersInit) {
    return out
  }
  new Headers(headersInit).forEach((value, key) => {
    out[key] = value
  })
  return out
}

function throwIfAborted(e: unknown): never {
  if (axios.isCancel(e)) {
    throw new DOMException("Aborted", "AbortError")
  }
  const code = (e as AxiosError)?.code
  if (code === "ERR_CANCELED") {
    throw new DOMException("Aborted", "AbortError")
  }
  throw e as Error
}

/**
 * Виконує запит через Axios і повертає Web `Response`, щоб не переписувати всі виклики (`ok`, `json`, `text`).
 */
async function axiosRequestAsWebResponse(
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase() as Method
  const headers = headersInitToPlain(init.headers ?? undefined)
  if (init.cache === "no-store") {
    headers["Cache-Control"] = "no-store"
  }

  const body = init.body
  const isForm = typeof FormData !== "undefined" && body instanceof FormData
  if (isForm) {
    delete headers["Content-Type"]
    delete headers["content-type"]
  }

  const timeout = init.timeoutMs != null && init.timeoutMs > 0 ? init.timeoutMs : undefined

  const cfg: AxiosRequestConfig & {
    _authRetryAttempted?: boolean
    _skipAuthRefresh?: boolean
  } = {
    url,
    method,
    headers,
    data: body === null || body === undefined ? undefined : body,
    withCredentials: true,
    responseType: "arraybuffer",
    validateStatus: () => true,
    signal: init.signal ?? undefined,
    timeout,
  }

  try {
    const r = await apiClient.request<ArrayBuffer>(cfg)
    const outHeaders = new Headers()
    const raw = r.headers
    const flat =
      raw &&
      typeof (raw as AxiosHeaders).toJSON === "function"
        ? (raw as AxiosHeaders).toJSON() as Record<string, unknown>
        : (raw as unknown as Record<string, unknown>) ?? {}
    for (const [key, val] of Object.entries(flat)) {
      if (val === undefined || val === null) {
        continue
      }
      if (Array.isArray(val)) {
        val.forEach((v) => outHeaders.append(key, String(v)))
      } else {
        outHeaders.set(key, String(val))
      }
    }

    const buf = r.data
    const responseBody =
      buf instanceof ArrayBuffer && buf.byteLength === 0 && (r.status === 204 || r.status === 205)
        ? null
        : buf

    return new Response(responseBody, {
      status: r.status,
      statusText: String(r.statusText ?? ""),
      headers: outHeaders,
    })
  } catch (e) {
    throwIfAborted(e)
  }
}

/**
 * Запити до бекенду з HttpOnly refresh-cookie (`withCredentials: true`), через Axios.
 */
export function apiFetch(input: string | URL, init: ApiFetchInit = {}): Promise<Response> {
  const { timeoutMs, signal: outerSignal, _authRetryAttempted, ...rest } = init
  const url = typeof input === "string" ? input : input.href
  return axiosRequestAsWebResponse(url, {
    ...rest,
    signal: outerSignal,
    timeoutMs,
    _authRetryAttempted,
  } as RequestInit & { timeoutMs?: number; _authRetryAttempted?: boolean })
}

const apiClient: Axios = axios.create({
  withCredentials: true,
  responseType: "arraybuffer",
  validateStatus: () => true,
})

apiClient.interceptors.response.use(async (response) => {
  const originalRequest = response.config as AxiosRequestConfig & {
    _authRetryAttempted?: boolean
    _skipAuthRefresh?: boolean
  }

  const requestUrl = String(originalRequest.url ?? "")
  const isRefreshRequest = requestUrl.includes("/auth/refresh")
  const authHeader = String(
    (originalRequest.headers as Record<string, unknown> | undefined)?.Authorization ??
      (originalRequest.headers as Record<string, unknown> | undefined)?.authorization ??
      "",
  )
  const hasBearerAuth = authHeader.toLowerCase().startsWith("bearer ")

  if (
    response.status !== 401 ||
    isRefreshRequest ||
    originalRequest._skipAuthRefresh ||
    originalRequest._authRetryAttempted ||
    !hasBearerAuth ||
    typeof window === "undefined"
  ) {
    return response
  }

  try {
    const nextToken = await refreshToken()
    const nextHeaders = new Headers(originalRequest.headers as HeadersInit | undefined)
    nextHeaders.set("Authorization", `Bearer ${nextToken}`)

    const retryRequest: AxiosRequestConfig & {
      _authRetryAttempted?: boolean
      _skipAuthRefresh?: boolean
    } = {
      ...originalRequest,
      headers: Object.fromEntries(nextHeaders.entries()),
      _authRetryAttempted: true,
    }

    return await apiClient.request(retryRequest)
  } catch (error) {
    if (isUnauthorizedAuthError(error)) {
      await logout({ callBackend: false })
    }
    return response
  }
})
