"use client"

import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { useEffect, useState } from "react"
import styles from "@/app/[locale]/offline/offline.module.scss"

function BrandMark() {
  return (
    <div className={styles.brand} aria-hidden>
      <svg className={styles.brandSvg} width="44" height="44" viewBox="0 0 100 100" fill="none">
        <path
          d="M20 25C20 20 25 15 40 15H50V85H40C25 85 20 80 20 75V25Z"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M80 25C80 20 75 15 60 15H50V85H60C75 85 80 80 80 75V25Z"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M50 38V62 M42 48H58"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

function OfflineGlyph() {
  return (
    <svg
      className={styles.mark}
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M2.5 9.5c4-4 10.5-4 14.5 0M5 13c2.8-2.5 6.2-2.5 9 0M7.5 16.5c1.7-1.5 3.8-1.5 5.5 0"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M4 20L20 4"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function OfflinePage() {
  const t = useTranslations("offline")
  const [isOnline, setIsOnline] = useState(() => {
    if (typeof navigator === "undefined") {
      return false
    }

    return navigator.onLine
  })
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)

    document.body.classList.add("offlinePage")

    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)

    return () => {
      document.body.classList.remove("offlinePage")
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])

  const title = isOnline ? t("titleServer") : t("titleOffline")
  const description = isOnline ? t("descServer") : t("descOffline")

  return (
    <div className={styles.wrap}>
      <div className={styles.backdrop} aria-hidden />
      <div className={styles.vignette} aria-hidden />
      <section className={styles.inner} aria-labelledby="offline-title">
        <BrandMark />
        <p
          className={`${styles.status} ${isOnline ? styles.statusWarning : styles.statusOffline}`}
          aria-live="polite"
        >
          {isOnline ? t("statusOnline") : t("statusOffline")}
        </p>
        <div className={styles.iconOrb}>
          <OfflineGlyph />
        </div>
        <h1 id="offline-title" className={styles.title}>
          {title}
        </h1>
        <p className={styles.text}>{description}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.retry}
            onClick={() => {
              setIsRefreshing(true)
              window.location.reload()
            }}
          >
            {isRefreshing ? t("refreshing") : t("retry")}
          </button>
          <Link href="/" className={styles.home}>
            {t("home")}
          </Link>
        </div>
      </section>
    </div>
  )
}
