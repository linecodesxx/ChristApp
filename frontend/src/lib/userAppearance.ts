/** Примеры из настроек (можно сохранить в профиле). */
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

/** Последнее состояние для повторного применения при смене light/dark (см. ThemeToggle). */
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

/** Повторно применить внешний вид после смены `data-theme` (inline --foreground не должен ломать светлую палитру). */
export function reapplyUserAppearanceForCurrentTheme(): void {
  if (typeof document === "undefined" || cachedAppearanceUser === undefined) {
    return
  }
  applyUserAppearanceToDocument(cachedAppearanceUser)
}

/** Применить кастомные цвета/шрифт поверх data-theme (light/dark). */
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

  // Кастомные hex из профиля рассчитаны на тёмный фон (часто белый текст). В светлой теме inline-переменные
  // перебивают палитру из globals.scss — убираем их, чтобы работали --foreground / --surface из [data-theme="light"].
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
