/** Приклади з налаштувань (можна зберегти в профілі). */
export const SUGGESTED_THEME_FOREGROUND = "#FFFFFF"
export const SUGGESTED_THEME_BACKGROUND = "#2E2D2D"

export const THEME_FONT_KEYS = ["inter", "achiko", "bodoni-moda"] as const
export type ThemeFontKey = (typeof THEME_FONT_KEYS)[number]

export function normalizeThemeFontKey(value: string | null | undefined): ThemeFontKey {
  const v = value?.trim()
  if (!v) return "inter"
  if (THEME_FONT_KEYS.includes(v as ThemeFontKey)) {
    return v as ThemeFontKey
  }
  return "inter"
}

export type UserAppearanceFields = {
  themeForegroundHex?: string | null
  themeBackgroundHex?: string | null
  themeFontKey?: string | null
}

/** Останній стан для повторного застосування при зміні light/dark (див. ThemeToggle). */
let cachedAppearanceUser: UserAppearanceFields | null | undefined

function normalizeHex(input: string | null | undefined): string | undefined {
  if (input == null || typeof input !== "string") {
    return undefined
  }
  const t = input.trim()
  if (!t) {
    return undefined
  }
  const withHash = t.startsWith("#") ? t : `#${t}`
  return /^#[0-9A-Fa-f]{6}$/.test(withHash) ? withHash : undefined
}

/** Повторно застосувати зовнішній вигляд після зміни `data-theme` (inline --foreground не має ламати світлу палітру). */
export function reapplyUserAppearanceForCurrentTheme(): void {
  if (typeof document === "undefined" || cachedAppearanceUser === undefined) {
    return
  }
  applyUserAppearanceToDocument(cachedAppearanceUser)
}

/** Застосувати кастомні кольори/шрифт поверх data-theme (light/dark). */
export function applyUserAppearanceToDocument(user: UserAppearanceFields | null | undefined): void {
  if (typeof document === "undefined") {
    return
  }

  const root = document.documentElement
  cachedAppearanceUser = user ?? null

  if (!user) {
    root.style.removeProperty("--foreground")
    root.style.removeProperty("--book-title-color")
    root.style.removeProperty("--background")
    document.body.style.removeProperty("font-family")
    return
  }

  const theme = root.getAttribute("data-theme") ?? "dark"
  const isLight = theme === "light"

  const fg = normalizeHex(user.themeForegroundHex ?? undefined)
  const bg = normalizeHex(user.themeBackgroundHex ?? undefined)

  // Кастомні hex з профілю розраховані на темний фон (часто білий текст). У світлій темі inline-змінні
  // перебивають палітру з globals.scss — прибираємо їх, щоб працювали --foreground / --surface із [data-theme="light"].
  if (isLight) {
    root.style.removeProperty("--foreground")
    root.style.removeProperty("--book-title-color")
    root.style.removeProperty("--background")
  } else if (fg) {
    root.style.setProperty("--foreground", fg)
    root.style.setProperty("--book-title-color", fg)
  } else {
    root.style.removeProperty("--foreground")
    root.style.removeProperty("--book-title-color")
  }

  if (!isLight) {
    if (bg) {
      root.style.setProperty("--background", bg)
    } else {
      root.style.removeProperty("--background")
    }
  }

  const fontKey = normalizeThemeFontKey(user.themeFontKey)
  if (fontKey === "achiko") {
    document.body.style.fontFamily = '"Achiko", "Inter", ui-sans-serif, system-ui, sans-serif'
  } else if (fontKey === "bodoni-moda") {
    document.body.style.fontFamily = 'var(--font-bodoni-moda), "Bodoni Moda", ui-serif, Georgia, serif'
  } else {
    document.body.style.removeProperty("font-family")
  }
}
