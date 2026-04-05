/** Достаёт `sub` из JWT без проверки подписи (только для ключей кеша / UI). */
export function getUserIdFromJwt(token: string): string | undefined {
  try {
    const [, payloadPart] = token.split(".")
    if (!payloadPart) return undefined

    const normalizedPayload = payloadPart.replace(/-/g, "+").replace(/_/g, "/")
    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      "=",
    )

    const parsedPayload = JSON.parse(window.atob(paddedPayload)) as { sub?: unknown }
    return typeof parsedPayload?.sub === "string" ? parsedPayload.sub : undefined
  } catch {
    return undefined
  }
}
