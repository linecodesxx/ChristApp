/** Кеш текущего пользователя (синхронно с useAuth и списком /users). */
export const AUTH_ME_QUERY_ROOT = ["auth", "me"] as const

export function currentUserQueryKey(userId: string | undefined) {
  return [...AUTH_ME_QUERY_ROOT, userId ?? "none"] as const
}
