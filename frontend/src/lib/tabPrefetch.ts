import type { QueryClient } from "@tanstack/react-query"
import { getAuthToken } from "@/lib/auth"
import { BIBLE_LAST_READ_STORAGE_KEY } from "@/lib/bibleReadingProgress"
import {
  bibleBooksQueryKey,
  bibleChapterTextQueryKey,
  bibleChaptersQueryKey,
  bibleStaticQueryOptions,
  bibleTranslationsQueryKey,
  fetchBibleBooksForQuery,
  fetchBibleChapterTextForQuery,
  fetchBibleChaptersForQuery,
  fetchBibleTranslationsForQuery,
  type BibleTranslationItem,
} from "@/lib/queries/bibleQueries"
import { getAppLocaleFromWindow, pickTranslationShortName } from "@/lib/bibleTranslationForLocale"
import { getUserIdFromJwt } from "@/lib/jwtUser"
import {
  fetchPushStatusForQuery,
  fetchUnreadSummaryForQuery,
  pushStatusQueryKey,
  pushUnreadSummaryQueryKey,
} from "@/lib/queries/pushQueries"
import { fetchSavedVersesForQuery, savedVersesQueryKey } from "@/lib/queries/versesQueries"
import { fetchUsersDirectory, usersDirectoryQueryKey } from "@/lib/queries/usersQueries"

/** Prefetch при наведенні на таб «Чат». */
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

/** Prefetch при наведенні на таб «Профіль». */
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

/**
 * Prefetch Біблії до переходу на таб: переклади, список книг, список глав і текст глави
 * (ключи совпадают с BibleReader / bibleQueries).
 */
export function prefetchTabBibleData(queryClient: QueryClient, localeHint?: string) {
  if (typeof window === "undefined") return

  const locale = localeHint ?? getAppLocaleFromWindow()

  void queryClient
    .prefetchQuery({
      queryKey: bibleTranslationsQueryKey,
      queryFn: fetchBibleTranslationsForQuery,
      ...bibleStaticQueryOptions,
    })
    .then(() => {
      const translations =
        (queryClient.getQueryData(bibleTranslationsQueryKey) as BibleTranslationItem[] | undefined) ?? []
      const translation = pickTranslationShortName(translations, locale)

      return queryClient
        .prefetchQuery({
          queryKey: bibleBooksQueryKey(translation),
          queryFn: () => fetchBibleBooksForQuery(translation),
          ...bibleStaticQueryOptions,
        })
        .then(() => {
          let bookId: string | undefined
          let chapter = 1
          try {
            const raw = window.localStorage.getItem(BIBLE_LAST_READ_STORAGE_KEY)
            const parsed = raw ? (JSON.parse(raw) as { bookId?: string; chapter?: number }) : null
            if (parsed?.bookId) {
              bookId = parsed.bookId
              chapter = Number(parsed.chapter) || 1
            }
          } catch {
            // ігноруємо невалідний JSON
          }

          const books = queryClient.getQueryData<Array<{ id: string }>>(bibleBooksQueryKey(translation))
          if (!bookId && books?.[0]?.id) {
            bookId = books[0].id
            chapter = 1
          }
          if (!bookId) return

          void queryClient.prefetchQuery({
            queryKey: bibleChaptersQueryKey(translation, bookId),
            queryFn: () => fetchBibleChaptersForQuery(translation, bookId!),
            ...bibleStaticQueryOptions,
          })

          void queryClient.prefetchQuery({
            queryKey: bibleChapterTextQueryKey(translation, bookId, chapter),
            queryFn: () => fetchBibleChapterTextForQuery(translation, bookId, chapter),
            ...bibleStaticQueryOptions,
          })
        })
    })
}

