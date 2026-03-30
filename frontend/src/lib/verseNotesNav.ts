export function canSeeVerseNotesNav(username: string | undefined | null): boolean {
  const u = username?.trim()
  return Boolean(u)
}
