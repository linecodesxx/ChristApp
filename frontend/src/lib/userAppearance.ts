/** Примеры из настроек (можно сохранить в профиле). */
export const SUGGESTED_THEME_FOREGROUND = "#FFFFFF"
export const SUGGESTED_THEME_BACKGROUND = "#99D0EE"

export const THEME_FONT_KEYS = ["inter", "pastah", "achiko"] as const
export type ThemeFontKey = (typeof THEME_FONT_KEYS)[number]

export function normalizeThemeFontKey(value: string | null | undefined): ThemeFontKey {
  if (value === "pastah" || value === "achiko") {
    return value
  }
  return "inter"
}

export type UserAppearanceFields = {
  themeForegroundHex?: string | null
  themeBackgroundHex?: string | null
  themeFontKey?: string | null
}

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

/** Применить кастомные цвета/шрифт поверх data-theme (light/dark). */
export function applyUserAppearanceToDocument(user: UserAppearanceFields | null | undefined): void {
  if (typeof document === "undefined") {
    return
  }

  const root = document.documentElement

  if (!user) {
    root.style.removeProperty("--foreground")
    root.style.removeProperty("--book-title-color")
    root.style.removeProperty("--background")
    document.body.style.removeProperty("font-family")
    return
  }

  const fg = normalizeHex(user.themeForegroundHex ?? undefined)
  const bg = normalizeHex(user.themeBackgroundHex ?? undefined)

  if (fg) {
    root.style.setProperty("--foreground", fg)
    root.style.setProperty("--book-title-color", fg)
  } else {
    root.style.removeProperty("--foreground")
    root.style.removeProperty("--book-title-color")
  }

  if (bg) {
    root.style.setProperty("--background", bg)
  } else {
    root.style.removeProperty("--background")
  }

  const fontKey = user.themeFontKey
  if (fontKey === "pastah") {
    document.body.style.fontFamily = '"Pastah", "Inter", ui-sans-serif, system-ui, sans-serif'
  } else if (fontKey === "achiko") {
    document.body.style.fontFamily = '"Achiko", "Inter", ui-sans-serif, system-ui, sans-serif'
  } else {
    document.body.style.removeProperty("font-family")
  }
}
