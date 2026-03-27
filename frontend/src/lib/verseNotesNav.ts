/** Логин (username), для которого в навбаре показываются «Заметки по стихам». */
export const VERSE_NOTES_NAV_USERNAME = "neskai"

export function canSeeVerseNotesNav(username: string | undefined | null): boolean {
  const u = username?.trim()
  if (!u) {
    return false
  }
  return u.toLowerCase() === VERSE_NOTES_NAV_USERNAME.toLowerCase()
}
