"use client"

import { useEffect, useState } from "react"
import styles from "./SplashScreen.module.css"

const quotes = [
  "В начале было Слово...",
  "Слово Твое — светильник ноге моей",
  "Бог есть любовь",
  "Вера же есть осуществление ожидаемого",
]

const SPLASH_MS = 4000
const TYPING_MS = 50
const EXIT_MS = 480

export default function SplashScreen() {
  const [quote] = useState(() => quotes[Math.floor(Math.random() * quotes.length)])
  const [text, setText] = useState("")
  const [phase, setPhase] = useState<"enter" | "exit" | "done">("enter")

  useEffect(() => {
    if (typeof window === "undefined") return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (reduceMotion) {
      queueMicrotask(() => setText(quote))
      const t = window.setTimeout(() => setPhase("exit"), Math.min(SPLASH_MS, 1800))
      return () => window.clearTimeout(t)
    }

    let i = 0
    const typingInterval = window.setInterval(() => {
      i += 1
      setText(quote.substring(0, i))
      if (i >= quote.length) {
        window.clearInterval(typingInterval)
      }
    }, TYPING_MS)

    const fadeTimer = window.setTimeout(() => setPhase("exit"), SPLASH_MS)

    return () => {
      window.clearInterval(typingInterval)
      window.clearTimeout(fadeTimer)
    }
  }, [quote])

  useEffect(() => {
    if (phase !== "exit") return
    const t = window.setTimeout(() => setPhase("done"), EXIT_MS)
    return () => window.clearTimeout(t)
  }, [phase])

  if (phase === "done") {
    return null
  }

  return (
    <div
      className={`${styles.splashWrapper} ${phase === "exit" ? styles.splashWrapperExiting : ""}`}
      aria-hidden={phase === "exit"}
    >
      <svg width="100" height="100" viewBox="0 0 100 100" className={styles.logo} aria-hidden>
        <path
          pathLength={400}
          d="M20 25C20 20 25 15 40 15H50V85H40C25 85 20 80 20 75V25Z"
          className={styles.pathDraw}
        />
        <path
          pathLength={400}
          d="M80 25C80 20 75 15 60 15H50V85H60C75 85 80 80 80 75V25Z"
          className={`${styles.pathDraw} ${styles.pathDrawDelayed}`}
        />
        <path d="M50 35V65 M40 45H60" className={styles.cross} />
      </svg>

      <div className={styles.quoteContainer}>
        {text}
        <span className={styles.cursor} aria-hidden />
      </div>
    </div>
  )
}
