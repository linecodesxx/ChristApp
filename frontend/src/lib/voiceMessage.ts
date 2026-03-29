export const VOICE_META_PREFIX = "[[voice:"
export const VOICE_META_SUFFIX = "]]"

/** Если `content` целиком — маркер голосового, возвращает публичный URL аудио. */
export function parseVoiceMessageUrl(content: string): string | null {
  const t = content.trim()
  if (!t.startsWith(VOICE_META_PREFIX) || !t.endsWith(VOICE_META_SUFFIX)) {
    return null
  }
  const encoded = t.slice(VOICE_META_PREFIX.length, t.length - VOICE_META_SUFFIX.length)
  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}

export function isVoiceOnlyMessageContent(content: string): boolean {
  return parseVoiceMessageUrl(content) !== null
}
