"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { useAuth } from "@/hooks/useAuth"
import { canSeeDashboardNav } from "@/lib/adminDashboardNav"
import RandomVerseWidget from "@/components/RandomVerseWidget/RandomVerseWidget"
import { getAppStreak } from "@/lib/appStreak"
import {
  BIBLE_READING_PROGRESS_CHANGED_EVENT,
  readBibleLastReadFromStorage,
  type BibleLastRead,
} from "@/lib/bibleReadingProgress"
import { loadRecentVerseNotesAcrossCollections } from "@/lib/verseNotesStorage"
import styles from "./dashboard.module.scss"

function greetingDisplayName(user: { nickname?: string | null; username: string }): string {
  const n = user.nickname?.trim()
  return n || user.username
}

export default function DashboardPage() {
  const t = useTranslations("dashboard")
  const router = useRouter()
  const { user, loading } = useAuth()
  const [streak, setStreak] = useState(0)
  const [lastRead, setLastRead] = useState<BibleLastRead | null>(null)

  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace("/")
      return
    }
    if (!canSeeDashboardNav(user.username, user.isVip)) {
      router.replace("/bible")
    }
  }, [user, loading, router])

  useEffect(() => {
    const sync = () => {
      setStreak(getAppStreak())
      setLastRead(readBibleLastReadFromStorage())
    }
    sync()
    const onVis = () => {
      if (document.visibilityState === "visible") sync()
    }
    const onBibleProgress = () => sync()
    document.addEventListener("visibilitychange", onVis)
    window.addEventListener("focus", sync)
    window.addEventListener(BIBLE_READING_PROGRESS_CHANGED_EVENT, onBibleProgress)
    return () => {
      document.removeEventListener("visibilitychange", onVis)
      window.removeEventListener("focus", sync)
      window.removeEventListener(BIBLE_READING_PROGRESS_CHANGED_EVENT, onBibleProgress)
    }
  }, [])

  const lastReadLabel = useMemo(() => {
    if (!lastRead) {
      return t("openBible")
    }
    const bookLabel = lastRead.bookName?.trim() || lastRead.bookId
    return `${bookLabel} · ${t("chapterAbbr")} ${lastRead.chapter}`
  }, [lastRead, t])

  const recentNotes = useMemo(
    () => (user?.id ? loadRecentVerseNotesAcrossCollections(user.id, 5) : []),
    [user?.id],
  )

  if (loading || !user || !canSeeDashboardNav(user.username, user.isVip)) {
    return (
      <div className={styles.page} aria-busy="true">
        <div className={styles.appBrand} aria-label="ChristApp">
          <span className={styles.appBrandName}>ChristApp</span>
        </div>
      </div>
    )
  }

  const name = greetingDisplayName(user)

  return (
    <div className={styles.page}>
      <div className={styles.appBrand}>
        <span className={styles.appBrandName}>ChristApp</span>
      </div>

      <section className={styles.greeting} aria-label={t("greetingAria")}>
        <p className={styles.greetingHi}>
          {t("greetingHi", { name })}
        </p>
        <p className={styles.greetingLead}>{t("greetingLead")}</p>
      </section>

      <section className={styles.feedSection} aria-label={t("randomVerse")}>
        <h2 className={styles.feedTitle}>{t("randomVerse")}</h2>
        <RandomVerseWidget />
      </section>

      <header className={styles.header}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>{t("streak")}</span>
          <div className={styles.statValueRow}>
            <Image src="/icon-fire.svg" alt="" width={22} height={22} aria-hidden />
            <span className={styles.streakNumber}>{streak}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>{t("lastRead")}</span>
          <Link href="/bible" className={styles.lastLink} prefetch>
            {lastReadLabel}
          </Link>
          {!lastRead ? <span className={styles.lastMuted}>{t("lastReadHint")}</span> : null}
        </div>
      </header>

      <section className={styles.feedSection} aria-label={t("recentNotesTitle")}>
        <h2 className={styles.feedTitle}>{t("recentNotesTitle")}</h2>
        {recentNotes.length === 0 ? (
          <p className={styles.feedEmpty}>{t("recentNotesEmpty")}</p>
        ) : (
          <ul className={styles.feedList}>
            {recentNotes.map((note) => (
              <li key={note.id}>
                <Link href="/verse-notes" className={styles.feedLink} prefetch>
                  <div className={styles.feedLinkTitle}>{t("openVerseNotes")}</div>
                  <div className={styles.feedNoteSnippet}>{note.sourceText}</div>
                  <div className={styles.feedLinkMeta}>
                    {new Date(note.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

    </div>
  )
}
