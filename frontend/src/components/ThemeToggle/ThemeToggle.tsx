"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import styles from "./ThemeToggle.module.scss"

type ThemeMode = "light" | "dark"
const THEME_STORAGE_KEY = "theme"

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme)
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark"
    try {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
      return savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark"
    } catch {
      return "dark"
    }
  })
  const pathname = usePathname()

  useEffect(() => {
    applyTheme(theme)

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {}
  }, [theme])

  const handleToggle = () => {
    setTheme((currentTheme: ThemeMode) => (currentTheme === "light" ? "dark" : "light"))
  }

  const isLight = theme === "light"
  const isProfilePage = pathname.startsWith("/profile")

  if (isProfilePage) {
    return null
  }

  return (
    <div className={styles.hanger}>
      <span className={styles.mount} />
      <button
        type="button"
        className={`${styles.toggle} ${isLight ? styles.light : styles.dark}`}
        onClick={handleToggle}
        aria-label={isLight ? "Pull the cord to switch to dark theme" : "Pull the cord to switch to light theme"}
        title={isLight ? "Pull the cord (dark theme)" : "Pull the cord (light theme)"}
      >
        <span className={styles.rope} />
        <span className={styles.lamp}>
          <span className={styles.glow} />
        </span>
      </button>
    </div>
  )
}
