import { getHttpApiBase } from "@/lib/apiBase"

/** Публичный URL картинки аватара (относительный путь с API или абсолютный). */
export function resolvePublicAvatarUrl(avatarUrl: string | null | undefined): string | undefined {
  if (avatarUrl == null) return undefined
  const raw = String(avatarUrl).trim()
  if (!raw) return undefined
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  const base = getHttpApiBase().replace(/\/+$/, "")
  return raw.startsWith("/") ? `${base}${raw}` : `${base}/${raw}`
}
