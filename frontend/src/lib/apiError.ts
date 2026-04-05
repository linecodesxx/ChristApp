type ApiErrorPayload = {
  message?: string | string[]
}

export function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload
  }

  if (typeof payload !== "object" || payload === null) {
    return fallback
  }

  const { message } = payload as ApiErrorPayload

  if (Array.isArray(message)) {
    const normalized = message.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    return normalized.join(". ") || fallback
  }

  if (typeof message === "string" && message.trim()) {
    return message
  }

  return fallback
}

/** Разбор тела ответа после `await res.text()` (один раз читает body). */
export function messageFromApiResponseBody(responseText: string, httpStatus: number, fallback: string): string {
  const trimmed = responseText.trim()
  if (!trimmed) {
    if (httpStatus === 409) {
      return "Этот email или username уже заняты. Войдите или выберите другие данные."
    }
    if (httpStatus === 401) {
      return "Неверный логин или пароль."
    }
    if (httpStatus === 400) {
      return "Проверьте введённые данные."
    }
    if (httpStatus === 403) {
      return "Доступ запрещён."
    }
    if (httpStatus >= 500) {
      return "Ошибка на сервере. Попробуйте позже."
    }
    return fallback
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown
    return getApiErrorMessage(parsed, fallback)
  } catch {
    const slice = trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed
    return slice || fallback
  }
}

/**
 * Сообщение для TypeError «Failed to fetch» и сетевых сбоев (без тела ответа от API).
 */
export function getNetworkFailureHint(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Сервер долго не отвечает — часто так бывает при холодном старте (1–3 минуты). Подождите по таймеру на экране или попробуйте снова чуть позже."
  }
  if (!(err instanceof Error)) {
    return "Проверьте подключение к интернету и попробуйте снова."
  }
  const m = err.message.toLowerCase()
  if (m.includes("aborted") || m.includes("abort")) {
    return "Сервер долго не отвечает — часто так бывает при холодном старте (1–3 минуты). Подождите по таймеру на экране или попробуйте снова чуть позже."
  }
  if (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed") ||
    m.includes("network request failed") ||
    m.includes("fetch failed")
  ) {
    return "Браузер не смог связаться с сервером. Проверьте NEXT_PUBLIC_API_URL и что на бэкенде CORS_ORIGIN совпадает с адресом сайта (не «*»). Если NEXT_PUBLIC_API_URL не задан — запросы идут через /api/nest; проверьте, что Next запущен и BACKEND_PROXY_TARGET указывает на API."
  }
  return err.message
}
