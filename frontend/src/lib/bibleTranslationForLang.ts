import type { BibleTranslationItem } from "@/lib/queries/bibleQueries"

const APP_LANGS = new Set(["en", "ru", "ua"])

/** Перша сегмент-папка в шляху: /en/bible → en */
export function getAppLangFromPathname(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0] ?? ""
  return APP_LANGS.has(seg) ? seg : "ru"
}

export function getAppLangFromWindow(): string {
  if (typeof window === "undefined") {
    return "ru"
  }
  return getAppLangFromPathname(window.location.pathname)
}

/**
 * Підбирає short_name перекладу за мовою інтерфейсу (список з /bible/get-languages).
 * За порожнього списку — консервативні коди з env або NRT/WEB.
 */
export function pickTranslationShortName(
  translations: BibleTranslationItem[],
  lang: string,
): string {
  const lower = (s: string) => s.toLowerCase()

  const findLang = (...needles: string[]) => {
    for (const needle of needles) {
      const n = lower(needle)
      const hit = translations.find((t) => lower(t.language).includes(n))
      if (hit?.short_name) {
        return hit.short_name
      }
    }
    return null
  }

  if (translations.length > 0) {
    if (lang === "en") {
      return (
        translations.find((t) => lower(t.short_name) === "nkjv")?.short_name ??
        findLang("english", "англ") ??
        translations.find((t) => lower(t.short_name) === "web")?.short_name ??
        translations[0]?.short_name ??
        fallbackForLang(lang)
      )
    }
    if (lang === "ua") {
      return (
        findLang("ukrain", "україн", "украин", "ukrainian") ??
        translations.find((t) => lower(t.short_name) === "ubt")?.short_name ??
        translations[0]?.short_name ??
        fallbackForLang(lang)
      )
    }
    return (
      findLang("русск", "russian", "росій") ??
      translations.find((t) => t.short_name === "NRT")?.short_name ??
      translations[0]?.short_name ??
      "NRT"
    )
  }

  return fallbackForLang(lang)
}

function fallbackForLang(lang: string): string {
  if (lang === "en") {
    return process.env.NEXT_PUBLIC_BIBLE_TRANSLATION_EN ?? "NKJV"
  }
  if (lang === "ua") {
    return process.env.NEXT_PUBLIC_BIBLE_TRANSLATION_UA ?? "NRT"
  }
  return process.env.NEXT_PUBLIC_BIBLE_TRANSLATION_RU ?? "NRT"
}
