import axios, {
  type AxiosHeaders,
  type AxiosRequestConfig,
  type AxiosError,
  type Method,
} from "axios"

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

  const cfg: AxiosRequestConfig = {
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
    const r = await axios.request<ArrayBuffer>(cfg)
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

  const fetchWithTimeout = (requestInit: RequestInit): Promise<Response> => {
    return axiosRequestAsWebResponse(url, {
      ...requestInit,
      timeoutMs,
    })
  }

  const currentUrl = url
  const isRefreshRequest = currentUrl.includes("/auth/refresh")
  const authHeaderRaw =
    rest.headers instanceof Headers
      ? rest.headers.get("Authorization")
      : Array.isArray(rest.headers)
        ? rest.headers.find(([key]) => key.toLowerCase() === "authorization")?.[1] ?? null
        : (rest.headers?.["Authorization" as keyof typeof rest.headers] as string | null | undefined) ??
          (rest.headers?.["authorization" as keyof typeof rest.headers] as string | null | undefined) ??
          null
  const hasBearerAuth =
    typeof authHeaderRaw === "string" && authHeaderRaw.toLowerCase().startsWith("bearer ")

  return fetchWithTimeout(rest).then(async (response) => {
    if (
      response.status !== 401 ||
      _authRetryAttempted ||
      isRefreshRequest ||
      !hasBearerAuth ||
      typeof window === "undefined"
    ) {
      return response
    }

    const refreshed = await refreshAccessTokenOnce(timeoutMs)
    if (!refreshed) {
      return response
    }

    const { getAuthToken } = await import("@/lib/auth")
    const nextToken = getAuthToken()
    if (!nextToken) {
      return response
    }

    const nextHeaders = new Headers(rest.headers)
    nextHeaders.set("Authorization", `Bearer ${nextToken}`)
    return fetchWithTimeout({
      ...rest,
      headers: nextHeaders,
      signal: outerSignal,
    })
  })
}

let refreshInFlight: Promise<boolean> | null = null

async function refreshAccessTokenOnce(timeoutMs?: number): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight
  }

  refreshInFlight = (async () => {
    try {
      const { getHttpApiBase } = await import("@/lib/apiBase")
      const { setAuthToken, clearAuthToken } = await import("@/lib/auth")
      const refreshUrl = `${getHttpApiBase()}/auth/refresh`
      const response = await apiFetch(refreshUrl, {
        method: "POST",
        timeoutMs,
        _authRetryAttempted: true,
      })

      if (!response.ok) {
        clearAuthToken()
        return false
      }

      const payload = (await response.json()) as { access_token?: string }
      if (typeof payload.access_token !== "string" || payload.access_token.length === 0) {
        clearAuthToken()
        return false
      }

      setAuthToken(payload.access_token)
      return true
    } catch {
      return false
    }
  })().finally(() => {
    refreshInFlight = null
  })

  return refreshInFlight
}
