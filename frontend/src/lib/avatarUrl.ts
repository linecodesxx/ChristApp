import { getHttpApiBase } from "@/lib/apiBase"

/** Публічний URL зображення аватара (відносний шлях з API або абсолютний). */
export function resolvePublicAvatarUrl(avatarUrl: string | null | undefined): string | undefined {
  if (avatarUrl == null) return undefined
  const raw = String(avatarUrl).trim()
  if (!raw) return undefined
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
  const base = getHttpApiBase().replace(/\/+$/, "")
  return raw.startsWith("/") ? `${base}${raw}` : `${base}/${raw}`
}
