/** Синхронно з BibleReader / prefetch таба «Біблія». */
export const BIBLE_LAST_READ_STORAGE_KEY = "lastRead"

/** Унікальні ключі «книга|глава», зараховані після дочитування до кінця. */
export const BIBLE_READ_CHAPTERS_STORAGE_KEY = "bibleReadChaptersV1"

/** Подія в тому ж вікні (storage не спрацьовує в тій самій вкладці). */
export const BIBLE_READING_PROGRESS_CHANGED_EVENT = "christapp:bible-reading-progress"

/** Протестантський канон, усього глав (для кільця й «залишилось до кола»). */
export const TOTAL_BIBLE_CHAPTERS = 1189

export type BibleLastRead = {
  bookId: string
  chapter: number
  bookName?: string
}

function parseLastRead(raw: string | null): BibleLastRead | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<BibleLastRead>
    if (!parsed?.bookId || typeof parsed.chapter !== "number") return null
    return {
      bookId: String(parsed.bookId),
      chapter: parsed.chapter,
      bookName: typeof parsed.bookName === "string" ? parsed.bookName : undefined,
    }
  } catch {
    return null
  }
}

export function readBibleLastReadFromStorage(): BibleLastRead | null {
  if (typeof window === "undefined") return null
  return parseLastRead(window.localStorage.getItem(BIBLE_LAST_READ_STORAGE_KEY))
}

function readChapterKeysFromStorage(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(BIBLE_READ_CHAPTERS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []
  } catch {
    return []
  }
}

export function getReadChaptersCount(): number {
  return readChapterKeysFromStorage().length
}

export function getBibleReadingProgressFraction(): number {
  const n = getReadChaptersCount()
  if (n <= 0) return 0
  return Math.min(1, n / TOTAL_BIBLE_CHAPTERS)
}

export function chapterProgressKey(bookId: string, chapter: number): string {
  return `${bookId}|${chapter}`
}

export function markBibleChapterCompleted(bookId: string, chapter: number): boolean {
  if (typeof window === "undefined") return false
  const key = chapterProgressKey(bookId, chapter)
  const keys = readChapterKeysFromStorage()
  if (keys.includes(key)) return false
  keys.push(key)
  try {
    window.localStorage.setItem(BIBLE_READ_CHAPTERS_STORAGE_KEY, JSON.stringify(keys))
    window.dispatchEvent(new Event(BIBLE_READING_PROGRESS_CHANGED_EVENT))
    return true
  } catch {
    return false
  }
}

export function getBibleReadingProgressSnapshot(): {
  readCount: number
  fraction: number
  lastRead: BibleLastRead | null
  remainingToFullCanon: number
} {
  const readCount = getReadChaptersCount()
  return {
    readCount,
    fraction: getBibleReadingProgressFraction(),
    lastRead: readBibleLastReadFromStorage(),
    remainingToFullCanon: Math.max(0, TOTAL_BIBLE_CHAPTERS - readCount),
  }
}
