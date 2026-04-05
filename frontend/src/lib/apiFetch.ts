export type ApiFetchInit = RequestInit & {
  /** Таймаут для холодного старта / «засыпающего» API (AbortError при превышении). */
  timeoutMs?: number
}

/**
 * Запросы к бэкенду с HttpOnly refresh-cookie (credentials: 'include').
 */
export function apiFetch(input: string | URL, init: ApiFetchInit = {}): Promise<Response> {
  const { timeoutMs, signal: outerSignal, ...rest } = init

  if (timeoutMs == null || timeoutMs <= 0) {
    return fetch(input, {
      ...rest,
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
    ...rest,
    credentials: "include",
    signal: ctrl.signal,
  }).finally(() => {
    clearTimeout(timer)
    outerSignal?.removeEventListener("abort", onOuterAbort)
  })
}
