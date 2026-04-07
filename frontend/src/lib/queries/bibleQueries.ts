import { fetchBooks, fetchChapters, fetchFullChapter, fetchTranslations } from "@/lib/bibleApi"

/** Текст Библии и справочники статичны — без фоновых refetch при фокусе PWA. */
export const BIBLE_STATIC_GC_TIME_MS = 1000 * 60 * 60 * 24 * 7

export const bibleStaticQueryOptions = {
  staleTime: Infinity,
  gcTime: BIBLE_STATIC_GC_TIME_MS,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
}

export const bibleTranslationsQueryKey = ["bible", "translations"] as const

export function bibleBooksQueryKey(translation: string) {
  return ["bible", "books", translation] as const
}

export function bibleChaptersQueryKey(translation: string, bookId: string) {
  return ["bible", "chapters", translation, bookId] as const
}

export function bibleChapterTextQueryKey(translation: string, bookId: string, chapter: number) {
  return ["chapter", translation, bookId, chapter] as const
}

export async function fetchBibleTranslationsForQuery() {
  return fetchTranslations()
}

export async function fetchBibleBooksForQuery(translation: string) {
  return fetchBooks(translation)
}

export async function fetchBibleChaptersForQuery(translation: string, bookId: string) {
  return fetchChapters(bookId, translation)
}

export async function fetchBibleChapterTextForQuery(
  translation: string,
  bookId: string,
  chapter: number,
) {
  return fetchFullChapter(bookId, chapter, translation)
}
