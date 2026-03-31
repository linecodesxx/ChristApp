const STICKER_META_PREFIX = "[[sticker:"
const STICKER_META_SUFFIX = "]]"

function isValidStickerPath(value: string): boolean {
  return value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://")
}

export function buildStickerMessagePayload(stickerId: string, stickerPath: string): string {
  return `${STICKER_META_PREFIX}${stickerId}${STICKER_META_SUFFIX}${stickerPath}`
}

export function parseStickerMessagePayload(rawContent: string): { stickerId: string; path: string } | null {
  const text = (rawContent ?? "").trim()
  if (!text.startsWith(STICKER_META_PREFIX)) {
    return null
  }
  const suffixIndex = text.indexOf(STICKER_META_SUFFIX, STICKER_META_PREFIX.length)
  if (suffixIndex === -1) {
    return null
  }
  const stickerId = text.slice(STICKER_META_PREFIX.length, suffixIndex).trim()
  if (!stickerId) {
    return null
  }
  const path = text.slice(suffixIndex + STICKER_META_SUFFIX.length).trim()
  if (!isValidStickerPath(path)) {
    return null
  }
  return {
    stickerId,
    path,
  }
}
