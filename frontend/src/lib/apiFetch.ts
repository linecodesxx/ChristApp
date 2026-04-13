export type ApiFetchInit = RequestInit & {
  /** Таймаут для холодного старту / «засинаючого» API (AbortError при перевищенні). */
  timeoutMs?: number
  /** Внутренний флаг: уже был refresh+retry для этого запроса. */
  _authRetryAttempted?: boolean
}

/**
 * Запити до бекенду з HttpOnly refresh-cookie (credentials: 'include').
 */
export function apiFetch(input: string | URL, init: ApiFetchInit = {}): Promise<Response> {
  const { timeoutMs, signal: outerSignal, _authRetryAttempted, ...rest } = init

  const fetchWithTimeout = (requestInit: RequestInit): Promise<Response> => {
    if (timeoutMs == null || timeoutMs <= 0) {
      return fetch(input, {
        ...requestInit,
        credentials: "include",
        signal: outerSignal,
      })
    }

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)

    const onOuterAbort = () => ctrl.abort()
    if (outerSignal) {
      if (outerSignal.aborted) {
        clearTimeout(timer)
        return Promise.reject(new DOMException("Aborted", "AbortError"))
      }
      outerSignal.addEventListener("abort", onOuterAbort, { once: true })
    }

    return fetch(input, {
      ...requestInit,
      credentials: "include",
      signal: ctrl.signal,
    }).finally(() => {
      clearTimeout(timer)
      outerSignal?.removeEventListener("abort", onOuterAbort)
    })
  }

  const currentUrl = typeof input === "string" ? input : input.toString()
  const isRefreshRequest = currentUrl.includes("/auth/refresh")
  const authHeaderRaw =
    rest.headers instanceof Headers
      ? rest.headers.get("Authorization")
      : Array.isArray(rest.headers)
        ? rest.headers.find(([key]) => key.toLowerCase() === "authorization")?.[1] ?? null
        : (rest.headers?.["Authorization" as keyof typeof rest.headers] as string | null | undefined) ??
          (rest.headers?.["authorization" as keyof typeof rest.headers] as string | null | undefined) ??
          null
  const hasBearerAuth = typeof authHeaderRaw === "string" && authHeaderRaw.toLowerCase().startsWith("bearer ")

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
      credentials: "include",
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
