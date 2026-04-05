import type { QueryClient } from "@tanstack/react-query"
import { fetchFullChapter } from "@/lib/bibleApi"
import { getAuthToken } from "@/lib/auth"
import { getUserIdFromJwt } from "@/lib/jwtUser"
import {
  fetchPushStatusForQuery,
  fetchUnreadSummaryForQuery,
  pushStatusQueryKey,
  pushUnreadSummaryQueryKey,
} from "@/lib/queries/pushQueries"
import { fetchSavedVersesForQuery, savedVersesQueryKey } from "@/lib/queries/versesQueries"
import { fetchUsersDirectory, usersDirectoryQueryKey } from "@/lib/queries/usersQueries"

const LAST_READ_STORAGE_KEY = "lastRead"

/** Prefetch при наведении на таб «Чат». */
export function prefetchTabChatData(queryClient: QueryClient) {
  const token = getAuthToken()
  if (!token) return

  const userId = getUserIdFromJwt(token)

  void queryClient.prefetchQuery({
    queryKey: pushUnreadSummaryQueryKey(userId),
    queryFn: fetchUnreadSummaryForQuery,
    staleTime: 20_000,
  })

  void queryClient.prefetchQuery({
    queryKey: usersDirectoryQueryKey(),
    queryFn: fetchUsersDirectory,
    staleTime: 60_000,
  })
}

/** Prefetch при наведении на таб «Профиль». */
export function prefetchTabProfileData(queryClient: QueryClient) {
  const token = getAuthToken()
  if (!token) return

  const userId = getUserIdFromJwt(token)

  void queryClient.prefetchQuery({
    queryKey: pushStatusQueryKey(userId),
    queryFn: fetchPushStatusForQuery,
    staleTime: 60_000,
  })

  void queryClient.prefetchQuery({
    queryKey: savedVersesQueryKey(),
    queryFn: fetchSavedVersesForQuery,
    staleTime: 60_000,
  })
}

/** Prefetch последней прочитанной главы Библии (ключ совпадает с BibleReader). */
export function prefetchTabBibleChapter(queryClient: QueryClient) {
  if (typeof window === "undefined") return

  try {
    const raw = window.localStorage.getItem(LAST_READ_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as { bookId?: string; chapter?: number }) : null
    if (!parsed?.bookId) return

    const chapter = Number(parsed.chapter) || 1
    const translation = "NRT"

    void queryClient.prefetchQuery({
      queryKey: ["chapter", translation, parsed.bookId, chapter],
      queryFn: () => fetchFullChapter(parsed.bookId!, chapter, translation),
      staleTime: 1000 * 60 * 60,
    })
  } catch {
    // ignore invalid JSON
  }
}
