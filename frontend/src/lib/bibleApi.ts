/** Путь к нашему Next.js proxy (обходит CORS и даёт одинаковое поведение SSR/клиент). */
function buildProxyUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`
  const base =
    typeof window !== "undefined"
      ? ""
      : (process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"))
  return `${base}/api/bibleProxy${normalized}`
}

// ===== BASE FETCH =====
async function safeFetch(url: string) {
  try {
    const res = await fetch(url, { cache: "no-store" })

    if (!res.ok) {
      if (process.env.NODE_ENV === "development") {
        console.error("API ERROR:", res.status, url)
      }
      return null
    }

    const text = await res.text()

    try {
      return JSON.parse(text)
    } catch {
      if (process.env.NODE_ENV === "development") {
        console.error("NOT JSON:", text.slice(0, 200))
      }
      return null
    }
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.error("FETCH FAILED:", e)
    }
    return null
  }
}

// ===== FETCH BOOKS =====
export async function fetchBooks(translation: string) {
  if (!translation) return []

  const data = await safeFetch(
    buildProxyUrl(`/bible/get-books/${encodeURIComponent(translation)}`),
  )

  if (!Array.isArray(data)) {
    return []
  }

  return data
}

// ===== FETCH CHAPTERS =====
export async function fetchChapters(bookId: string, translation: string) {
  const books = await fetchBooks(translation)

  if (!Array.isArray(books) || books.length === 0) {
    return []
  }

  const currentBook = books.find((b: { id?: string }) => b?.id === bookId)

  if (!currentBook || typeof (currentBook as { chapters?: unknown }).chapters !== "number") {
    return []
  }

  return Array.from(
    { length: (currentBook as { chapters: number }).chapters },
    (_, i) => i + 1,
  )
}

// ===== FETCH FULL CHAPTER =====
export async function fetchFullChapter(book: string, chapter: number, translation: string) {
  if (!translation) return []

  const data = await safeFetch(
    buildProxyUrl(
      `/bible/get-text/${encodeURIComponent(translation)}/${encodeURIComponent(book)}/${chapter}`,
    ),
  )

  if (!Array.isArray(data)) {
    return []
  }

  return data
}

// ===== FETCH TRANSLATIONS =====
export async function fetchTranslations() {
  const data = await safeFetch(buildProxyUrl("/bible/get-languages"))

  if (!Array.isArray(data)) {
    return []
  }

  return data.flatMap((lang: { language?: string; translations?: unknown[] }) =>
    (Array.isArray(lang?.translations) ? lang.translations : []).map((t: unknown) => {
      const tr = t as { short_name?: string; full_name?: string; updated?: number }
      return {
        short_name: tr?.short_name || "unknown",
        full_name: tr?.full_name || "unknown",
        language: lang?.language || "unknown",
        updated: tr?.updated || 0,
      }
    }),
  )
}

// ===== FETCH RANDOM VERSE =====
const NT_BOOK_IDS = new Set([
  "MAT",
  "MRK",
  "LUK",
  "JHN",
  "ACT",
  "ROM",
  "1CO",
  "2CO",
  "GAL",
  "EPH",
  "PHP",
  "COL",
  "1TH",
  "2TH",
  "1TI",
  "2TI",
  "TIT",
  "PHM",
  "HEB",
  "JAS",
  "1PE",
  "2PE",
  "1JN",
  "2JN",
  "3JN",
  "JUD",
  "REV",
])

function normalizeBookLabel(value: string | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, "")
}

function isAllowedRandomBook(book: { id?: string; name?: string }) {
  const id = (book.id || "").toUpperCase()
  if (id === "PSA" || id === "PS") {
    return true
  }
  if (NT_BOOK_IDS.has(id)) {
    return true
  }

  const name = normalizeBookLabel(book.name)
  if (!name) {
    return false
  }

  if (name.includes("псалтир") || name.includes("псалом") || name.includes("psalm")) {
    return true
  }

  return (
    name.includes("матф") ||
    name.includes("марк") ||
    name.includes("лук") ||
    name.includes("иоан") ||
    name.includes("деян") ||
    name.includes("рим") ||
    name.includes("корин") ||
    name.includes("галат") ||
    name.includes("ефес") ||
    name.includes("филип") ||
    name.includes("колос") ||
    name.includes("фесс") ||
    name.includes("тимоф") ||
    name.includes("тит") ||
    name.includes("филим") ||
    name.includes("евре") ||
    name.includes("иаков") ||
    name.includes("петр") ||
    name.includes("иуд") ||
    name.includes("откров") ||
    name.includes("matt") ||
    name.includes("mark") ||
    name.includes("luke") ||
    name.includes("john") ||
    name.includes("acts") ||
    name.includes("romans") ||
    name.includes("corinth") ||
    name.includes("galat") ||
    name.includes("ephes") ||
    name.includes("philip") ||
    name.includes("coloss") ||
    name.includes("thess") ||
    name.includes("timoth") ||
    name.includes("hebre") ||
    name.includes("james") ||
    name.includes("peter") ||
    name.includes("jude") ||
    name.includes("revel")
  )
}

export async function fetchRandomVerse(translation: string) {
  if (!translation) return null

  // Get all books
  const books = await fetchBooks(translation)
  if (!books.length) return null

  const allowedBooks = books.filter((book) =>
    isAllowedRandomBook(book as { id?: string; name?: string }),
  )

  if (!allowedBooks.length) {
    return null
  }

  // Select random book
  const randomBook = allowedBooks[Math.floor(Math.random() * allowedBooks.length)] as {
    id?: string
    name?: string
    chapters?: number
  }
  if (!randomBook?.id || !randomBook?.name) return null

  // Get chapters for random book
  const chapters = await fetchChapters(randomBook.id, translation)
  if (!chapters.length) return null

  // Select random chapter
  const randomChapter = chapters[Math.floor(Math.random() * chapters.length)]

  // get-text ожидает код книги (AMO, GEN…), не локализованное имя — иначе 404.
  const verses = await fetchFullChapter(randomBook.id, randomChapter, translation)
  if (!verses.length) return null

  // Select random verse
  const randomVerse = verses[Math.floor(Math.random() * verses.length)] as {
    verse?: number | string
    text?: string
  } | null

  if (!randomVerse) return null

  const verse = randomVerse.verse
  const text = randomVerse.text
  if (verse === undefined || verse === null || text === undefined || text === null) {
    return null
  }

  return {
    book: randomBook.name,
    chapter: randomChapter,
    verse,
    text,
  }
}
