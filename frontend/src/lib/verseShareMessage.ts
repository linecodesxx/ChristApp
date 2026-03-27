export const VERSE_SHARE_META_PREFIX = "[[verse-share:"
export const VERSE_SHARE_META_SUFFIX = "]]"

export type VerseSharePayload = {
  bookName: string
  chapter: number
  verses: number[]
  text: string
}

export function serializeVerseSharePayload(payload: VerseSharePayload) {
  const safePayload: VerseSharePayload = {
    bookName: String(payload.bookName || "").trim() || "Библия",
    chapter: Number(payload.chapter) || 1,
    verses: Array.from(new Set(payload.verses.filter((v) => Number.isFinite(v)).map((v) => Number(v)))).sort(
      (a, b) => a - b,
    ),
    text: String(payload.text || "").trim(),
  }

  try {
    const encoded = encodeURIComponent(JSON.stringify(safePayload))
    return `${VERSE_SHARE_META_PREFIX}${encoded}${VERSE_SHARE_META_SUFFIX}${safePayload.text}`
  } catch {
    return safePayload.text
  }
}

export function parseVerseSharePayload(rawContent: string) {
  if (!rawContent.startsWith(VERSE_SHARE_META_PREFIX)) {
    return { payload: null as VerseSharePayload | null, content: rawContent }
  }

  const suffixIndex = rawContent.indexOf(VERSE_SHARE_META_SUFFIX, VERSE_SHARE_META_PREFIX.length)
  if (suffixIndex === -1) {
    return { payload: null as VerseSharePayload | null, content: rawContent }
  }

  const encodedMeta = rawContent.slice(VERSE_SHARE_META_PREFIX.length, suffixIndex)
  const plainContent = rawContent.slice(suffixIndex + VERSE_SHARE_META_SUFFIX.length)

  try {
    const parsed = JSON.parse(decodeURIComponent(encodedMeta)) as Partial<VerseSharePayload>
    const verses = Array.isArray(parsed.verses)
      ? parsed.verses.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : []

    if (!parsed.bookName || !parsed.chapter || verses.length === 0) {
      return { payload: null as VerseSharePayload | null, content: plainContent || rawContent }
    }

    return {
      payload: {
        bookName: String(parsed.bookName),
        chapter: Number(parsed.chapter),
        verses,
        text: String(parsed.text ?? plainContent),
      },
      content: plainContent || String(parsed.text ?? ""),
    }
  } catch {
    return { payload: null as VerseSharePayload | null, content: plainContent || rawContent }
  }
}

export function buildVerseReference(payload: VerseSharePayload) {
  const sorted = [...payload.verses].sort((a, b) => a - b)
  const versesLabel = sorted.length === 1 ? `${sorted[0]}` : `${sorted[0]}-${sorted[sorted.length - 1]}`
  return `${payload.bookName} ${payload.chapter}:${versesLabel}`
}
