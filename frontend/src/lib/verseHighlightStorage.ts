export const VERSE_HIGHLIGHT_STORAGE_KEY = "verse-highlight-colors"

export function isValidHighlightHex(color: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(color)
}
