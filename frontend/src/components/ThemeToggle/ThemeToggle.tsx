"use client"

import { useEffect, useState } from "react"
import styles from "./ThemeToggle.module.scss"

type ThemeMode = "light" | "dark"
const THEME_STORAGE_KEY = "theme"

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme)
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("dark")

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
      if (savedTheme === "light" || savedTheme === "dark") {
        setTheme(savedTheme)
      }
    } catch {}
  }, [])

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
