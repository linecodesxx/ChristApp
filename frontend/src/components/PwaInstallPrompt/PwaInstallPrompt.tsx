"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { usePathname } from "next/navigation"
import styles from "@/components/PwaInstallPrompt/PwaInstallPrompt.module.scss"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const IOS_DISMISS_KEY = "christapp_pwa_ios_hint_v1"
const IOS_DISMISS_MS = 21 * 24 * 60 * 60 * 1000
const IOS_SHOW_DELAY_MS = 9000

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return true
  const mq = window.matchMedia("(display-mode: standalone)")
  if (mq.matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

function isIosSafariFamily(): boolean {
  if (typeof window === "undefined") return false
  const ua = window.navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return true
  return window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1
}

function iosHintDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(IOS_DISMISS_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as { at?: number }
    if (typeof parsed.at !== "number") return false
    return Date.now() - parsed.at < IOS_DISMISS_MS
  } catch {
    return false
  }
}

export default function PwaInstallPrompt() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [variant, setVariant] = useState<"chromium" | "ios" | null>(null)
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)
  const iosTimerRef = useRef<number | null>(null)

  const resetSheet = useCallback(() => {
    setOpen(false)
    setVariant(null)
  }, [])

  const abortChromiumInstall = useCallback(() => {
    deferredRef.current = null
    resetSheet()
  }, [resetSheet])

  const dismissIosLong = useCallback(() => {
    try {
      localStorage.setItem(IOS_DISMISS_KEY, JSON.stringify({ at: Date.now() }))
    } catch {
      /* ignore */
    }
    resetSheet()
  }, [resetSheet])

  useEffect(() => {
    if (pathname === "/offline") return

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      deferredRef.current = e as BeforeInstallPromptEvent
      setVariant("chromium")
      setOpen(true)
    }

    const onAppInstalled = () => {
      abortChromiumInstall()
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt)
    window.addEventListener("appinstalled", onAppInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt)
      window.removeEventListener("appinstalled", onAppInstalled)
    }
  }, [pathname, abortChromiumInstall])

  useEffect(() => {
    if (pathname === "/offline") return
    if (!isIosSafariFamily() || isStandaloneDisplay()) return
    if (iosHintDismissedRecently()) return

    iosTimerRef.current = window.setTimeout(() => {
      if (deferredRef.current) return
      setVariant((v) => (v === "chromium" ? v : "ios"))
      setOpen(true)
    }, IOS_SHOW_DELAY_MS)

    return () => {
      if (iosTimerRef.current != null) {
        window.clearTimeout(iosTimerRef.current)
        iosTimerRef.current = null
      }
    }
  }, [pathname])

  const onInstallClick = useCallback(async () => {
    const ev = deferredRef.current
    if (!ev) return
    try {
      await ev.prompt()
      await ev.userChoice
    } catch {
      /* ignore */
    }
    abortChromiumInstall()
  }, [abortChromiumInstall])

  if (!variant) {
    return null
  }

  const sheetClass = `${styles.sheet} ${open ? styles.open : ""}`
  const backdropClass = `${styles.backdrop} ${open ? styles.open : ""}`

  return (
    <>
      <div
        className={backdropClass}
        aria-hidden={!open}
        onClick={variant === "ios" ? dismissIosLong : abortChromiumInstall}
      />
      <div
        className={sheetClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-title"
      >
        <div className={styles.handle} aria-hidden />
        <div className={styles.head}>
          <div className={styles.iconWrap}>
            <Image
              src="/icon-192x192.png"
              alt=""
              width={52}
              height={52}
              className={styles.icon}
              priority={false}
            />
          </div>
          <div className={styles.headText}>
            <h2 id="pwa-install-title" className={styles.title}>
              {variant === "chromium" ? "Установить Christ App" : "На экран «Домой»"}
            </h2>
            <p className={styles.subtitle}>
              {variant === "chromium"
                ? "Быстрый доступ с главного экрана, как у обычного приложения."
                : "Так удобнее пользоваться чатом и уведомлениями в Safari."}
            </p>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={variant === "ios" ? dismissIosLong : abortChromiumInstall}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {variant === "ios" ? (
          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.stepGlyph} aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 3v12M8 11l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 19h14" strokeLinecap="round" />
                </svg>
              </div>
              <p className={styles.stepText}>
                Нажми <strong>Поделиться</strong> <span aria-hidden>(□↑)</span> в панели Safari.
              </p>
            </div>
            <div className={styles.step}>
              <div className={styles.stepGlyph} aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="4" y="4" width="16" height="16" rx="3" strokeLinecap="round" />
                  <path d="M12 8v8M8 12h8" strokeLinecap="round" />
                </svg>
              </div>
              <p className={styles.stepText}>
                Выбери <strong>На экран «Домой»</strong>, затем подтверди.
              </p>
            </div>
          </div>
        ) : null}

        <div className={styles.actions}>
          {variant === "chromium" ? (
            <>
              <button type="button" className={styles.primary} onClick={onInstallClick}>
                Установить
              </button>
              <button type="button" className={styles.secondary} onClick={abortChromiumInstall}>
                Не сейчас
              </button>
            </>
          ) : (
            <button type="button" className={styles.primary} onClick={dismissIosLong}>
              Понятно
            </button>
          )}
        </div>
      </div>
    </>
  )
}
