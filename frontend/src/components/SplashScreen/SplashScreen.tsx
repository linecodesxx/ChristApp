"use client"

import { useEffect, useState } from "react"
import styles from "./SplashScreen.module.scss"

const BRAND_TEXT = "Christ App"

const BRAND_HOLD_MS = 1000
const TYPING_MS = 30
const EXIT_MS = 330

export default function SplashScreen() {
  const [text, setText] = useState("")
  const [phase, setPhase] = useState<"brand" | "exit" | "done">("brand")

  useEffect(() => {
    if (phase !== "brand") {
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        setText("")
      }
    })

    let i = 0
    const typingInterval = window.setInterval(() => {
      i += 1
      setText(BRAND_TEXT.substring(0, i))
      if (i >= BRAND_TEXT.length) {
        window.clearInterval(typingInterval)
      }
    }, TYPING_MS)

    const t = window.setTimeout(() => setPhase("exit"), BRAND_HOLD_MS)
    return () => {
      cancelled = true
      window.clearInterval(typingInterval)
      window.clearTimeout(t)
    }
  }, [phase])

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
