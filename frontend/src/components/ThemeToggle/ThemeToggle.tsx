"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { usePathname } from "@/i18n/navigation"
import { reapplyUserAppearanceForCurrentTheme } from "@/lib/userAppearance"
import styles from "./ThemeToggle.module.scss"

type ThemeMode = "light" | "dark"
const THEME_STORAGE_KEY = "theme"

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme)
}

export default function ThemeToggle() {
  const t = useTranslations("theme")
  // Совпадает с SSR и с <html data-theme="dark"> в layout — иначе гидрация ругается,
  // если в localStorage уже light (клиент читал стор до первого paint).
  const [theme, setTheme] = useState<ThemeMode>("dark")
  const [hasHydratedTheme, setHasHydratedTheme] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
      if (saved === "light" || saved === "dark") {
        setTheme(saved)
      }
    } catch {
      // ignore
    }
    setHasHydratedTheme(true)
  }, [])

  useEffect(() => {
    if (!hasHydratedTheme) {
      return
    }
    applyTheme(theme)
    reapplyUserAppearanceForCurrentTheme()
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {}
  }, [theme, hasHydratedTheme])

  const handleToggle = () => {
    setTheme((currentTheme: ThemeMode) => (currentTheme === "light" ? "dark" : "light"))
  }

  const isLight = theme === "light"
  const isProfilePage = pathname.startsWith("/profile")
  const isOfflinePage = pathname === "/offline"

  if (isProfilePage || isOfflinePage) {
    return null
  }

  return (
    <div className={styles.hanger}>
      <span className={styles.mount} />
      <button
        type="button"
        className={`${styles.toggle} ${isLight ? styles.light : styles.dark}`}
        onClick={handleToggle}
        aria-label={isLight ? t("toDark") : t("toLight")}
        title={isLight ? t("titleDark") : t("titleLight")}
      >
        <span className={styles.rope} />
        <span className={styles.lamp}>
          <span className={styles.glow} />
        </span>
      </button>
    </div>
  )
}
