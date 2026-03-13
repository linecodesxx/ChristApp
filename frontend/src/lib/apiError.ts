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
