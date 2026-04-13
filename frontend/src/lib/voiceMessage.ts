export const VOICE_META_PREFIX = "[[voice:"
export const VOICE_META_SUFFIX = "]]"

/** Якщо `content` повністю — маркер голосового, повертає публічний URL аудіо. */
export function parseVoiceMessageUrl(content: string): string | null {
  const rawUrl = content.trim()
  if (!rawUrl.startsWith(VOICE_META_PREFIX) || !rawUrl.endsWith(VOICE_META_SUFFIX)) {
    return null
  }
  const cleanUrl = rawUrl.replace(VOICE_META_PREFIX, "").replace(VOICE_META_SUFFIX, "")
  try {
    return decodeURIComponent(cleanUrl)
  } catch {
    return cleanUrl || null
  }
}

export function isVoiceOnlyMessageContent(content: string): boolean {
  return parseVoiceMessageUrl(content) !== null
}
