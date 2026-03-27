/** База API для публичных файлов (как в WebSocket / push). Без NEXT_PUBLIC_API_URL локально иначе /uploads уйдёт на порт Next, а не бэкенда. */
function publicApiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/+$/, "")
}

/** Публичный URL картинки аватара (относительный путь с API или абсолютный). */
export function resolvePublicAvatarUrl(avatarUrl: string | null | undefined): string | undefined {
  if (avatarUrl == null) return undefined
  const raw = String(avatarUrl).trim()
  if (!raw) return undefined
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  const base = publicApiBase()
  return raw.startsWith("/") ? `${base}${raw}` : `${base}/${raw}`
}
