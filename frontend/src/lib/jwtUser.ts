type JwtPayloadPreview = {
  sub?: unknown
  username?: unknown
  isVip?: unknown
  exp?: unknown
}

function parseJwtPayload(token: string): JwtPayloadPreview | null {
  try {
    const [, payloadPart] = token.split(".")
    if (!payloadPart) return null

    const normalizedPayload = payloadPart.replace(/-/g, "+").replace(/_/g, "/")
    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      "=",
    )

    return JSON.parse(window.atob(paddedPayload)) as JwtPayloadPreview
  } catch {
    return null
  }
}

/** Дістає `sub` із JWT без перевірки підпису (лише для ключів кешу / UI). */
export function getUserIdFromJwt(token: string): string | undefined {
  const parsedPayload = parseJwtPayload(token)
  return typeof parsedPayload?.sub === "string" ? parsedPayload.sub : undefined
}

/** `username` з access_token (без перевірки підпису) — для умовного UI до завантаження /auth/me. */
export function getUsernameFromJwt(token: string): string | undefined {
  const parsedPayload = parseJwtPayload(token)
  return typeof parsedPayload?.username === "string" ? parsedPayload.username : undefined
}

/** VIP з access_token (без перевірки підпису) — для TabBar до /auth/me. */
export function getIsVipFromJwt(token: string): boolean {
  const parsedPayload = parseJwtPayload(token)
  return parsedPayload?.isVip === true
}

/** UTC time in ms when JWT expires. Useful for proactive refresh on client/PWA. */
export function getJwtExpiresAt(token: string): number | undefined {
  const parsedPayload = parseJwtPayload(token)
  if (typeof parsedPayload?.exp !== "number" || !Number.isFinite(parsedPayload.exp)) {
    return undefined
  }
  return parsedPayload.exp * 1000
}
