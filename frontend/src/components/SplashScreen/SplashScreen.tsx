"use client"

import { useEffect, useState } from "react"
import { useLocale } from "next-intl"
import { fetchRandomVerse } from "@/lib/bibleApi"
import { scripturePlainText } from "@/lib/sanitizeScriptureHtml"
import styles from "./SplashScreen.module.scss"

const BRAND_TEXT = "Christ App"
function fallbackQuote(locale: string) {
  if (locale === "en") {
    return "The verse of the day will appear soon"
  }
  if (locale === "ua") {
    return "Вірш дня з'явиться незабаром"
  }
  return "Слово дня скоро появится"
}

function buildSplashQuote(text: string, reference: string, locale: string) {
  const normalizedText = scripturePlainText(text)
  const shortText = normalizedText.length > 140 ? `${normalizedText.slice(0, 137).trimEnd()}...` : normalizedText
  if (!shortText) {
    return fallbackQuote(locale)
  }
  return `${shortText} — ${reference}`
}

const BRAND_HOLD_MS = 1000
const VERSE_HOLD_MS = 1600
const TYPING_MS = 30
const EXIT_MS = 330

export default function SplashScreen() {
  const locale = useLocale()
  const [quote, setQuote] = useState<string>(() => fallbackQuote(locale))
  const [text, setText] = useState("")
  const [phase, setPhase] = useState<"brand" | "verse" | "exit" | "done">("brand")

  useEffect(() => {
    let cancelled = false
    const translation = locale === "en" ? "NKJV" : "NRT"

    const loadQuote = async () => {
      const randomVerse = await fetchRandomVerse(translation)
      if (cancelled || !randomVerse) {
        return
      }

      const reference = `${randomVerse.book} ${randomVerse.chapter}:${randomVerse.verse}`
      setQuote(buildSplashQuote(randomVerse.text, reference, locale))
    }

    void loadQuote()

    return () => {
      cancelled = true
    }
  }, [locale])

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

    const t = window.setTimeout(() => setPhase("verse"), BRAND_HOLD_MS)
    return () => {
      cancelled = true
      window.clearInterval(typingInterval)
      window.clearTimeout(t)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== "verse") {
      return
    }

    if (typeof window === "undefined") {
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        setText("")
      }
    })

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    if (reduceMotion) {
      queueMicrotask(() => setText(quote))
      const t = window.setTimeout(() => setPhase("exit"), VERSE_HOLD_MS)
      return () => {
        cancelled = true
        window.clearTimeout(t)
      }
    }

    let i = 0
    let holdTimer: number | null = null

    const typingInterval = window.setInterval(() => {
      i += 1
      setText(quote.substring(0, i))
      if (i >= quote.length) {
        window.clearInterval(typingInterval)
        holdTimer = window.setTimeout(() => setPhase("exit"), VERSE_HOLD_MS)
      }
    }, TYPING_MS)

    return () => {
      cancelled = true
      window.clearInterval(typingInterval)
      if (holdTimer != null) {
        window.clearTimeout(holdTimer)
      }
    }
  }, [phase, quote])

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
