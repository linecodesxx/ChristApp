"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { canSeeAdminDashboardNav } from "@/lib/adminDashboardNav"
import { getAppStreak } from "@/lib/appStreak"
import {
  BIBLE_READING_PROGRESS_CHANGED_EVENT,
  readBibleLastReadFromStorage,
  type BibleLastRead,
} from "@/lib/bibleReadingProgress"
import RandomVerseWidget from "@/components/RandomVerseWidget/RandomVerseWidget"
import styles from "./dashboard.module.scss"

function formatLastReadLabel(last: BibleLastRead | null): string {
  if (!last) return "Откройте Библию"
  const name = last.bookName?.trim() || last.bookId
  return `${name} · гл. ${last.chapter}`
}

function greetingDisplayName(user: { nickname?: string | null; username: string }): string {
  const n = user.nickname?.trim()
  return n || user.username
}

export default function DashboardPage() {
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
    if (!canSeeAdminDashboardNav(user.username)) {
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

  if (loading || !user || !canSeeAdminDashboardNav(user.username)) {
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
        <span className={styles.appBrandCross} aria-hidden>
          ✝
        </span>
        <span className={styles.appBrandName}>ChristApp</span>
      </div>

      <section className={styles.greeting} aria-label="Приветствие">
        <p className={styles.greetingHi}>
          Привет, <span className={styles.greetingName}>{name}</span>!
        </p>
        <p className={styles.greetingLead}>Сегодня прекрасный день — давай прочитаем слово дня.</p>
        <p className={styles.greetingHint}>
          И не забудь скинуть его своим друзьям —{" "}
          <Link href="/chat" className={styles.greetingChatLink} prefetch>
            загляни в чат
          </Link>
          .
        </p>
      </section>

      <header className={styles.header}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Серия дней</span>
          <div className={styles.statValueRow}>
            <Image src="/icon-fire.svg" alt="" width={22} height={22} aria-hidden />
            <span className={styles.streakNumber}>{streak}</span>
          </div>
        </div>

        <div className={styles.statCard}>
          <span className={styles.statLabel}>Последнее прочитанное</span>
          <Link href="/bible" className={styles.lastLink} prefetch>
            {formatLastReadLabel(lastRead)}
          </Link>
          {!lastRead ? <span className={styles.lastMuted}>Чтение сохранится в Библии</span> : null}
        </div>
      </header>

      <section className={styles.center} aria-labelledby="daily-bread-heading">
        <h2 id="daily-bread-heading" className={styles.sectionLabel}>
          Случайный стих
        </h2>
        <RandomVerseWidget />
      </section>
    </div>
  )
}
