"use client"

import { useEffect, useState } from "react"
import styles from "./ThemeToggle.module.scss"

type ThemeMode = "light" | "dark"

const THEME_STORAGE_KEY = "theme"

function getSystemTheme(): ThemeMode {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme)
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light")

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    const initialTheme: ThemeMode = saved === "light" || saved === "dark" ? saved : getSystemTheme()

    setTheme(initialTheme)
    applyTheme(initialTheme)
  }, [])

  const handleToggle = () => {
    const nextTheme: ThemeMode = theme === "light" ? "dark" : "light"
    setTheme(nextTheme)
    applyTheme(nextTheme)
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
  }

  const isLight = theme === "light"

  return (
    <div className={styles.hanger}>
      <span className={styles.mount} />

      <button
        type="button"
        className={`${styles.toggle} ${isLight ? styles.light : styles.dark}`}
        onClick={handleToggle}
        aria-label={isLight ? "Потянуть за верёвку: включить тёмную тему" : "Потянуть за верёвку: включить светлую тему"}
        title={isLight ? "Потянуть верёвку (тёмная тема)" : "Потянуть верёвку (светлая тема)"}
      >
        <span className={styles.rope} />
        <span className={styles.lamp}>
          <span className={styles.glow} />
        </span>
      </button>
    </div>
  )
}
