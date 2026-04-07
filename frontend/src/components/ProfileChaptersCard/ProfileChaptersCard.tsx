"use client"

import profileStyles from "@/app/profile/profile.module.scss"
import {
  TOTAL_BIBLE_CHAPTERS,
  type BibleLastRead,
} from "@/lib/bibleReadingProgress"
import { useBibleReadingProgressSnapshot } from "@/hooks/useBibleReadingProgressSnapshot"
import { prefetchTabBibleData } from "@/lib/tabPrefetch"
import Image from "next/image"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import styles from "./ProfileChaptersCard.module.scss"

const RING_R = 15
const RING_C = 2 * Math.PI * RING_R

function buildSubtitle(readCount: number, lastRead: BibleLastRead | null, remaining: string): string {
  if (readCount <= 0) {
    return "Начни путь сегодня"
  }
  if (lastRead?.bookName) {
    const tail = `${lastRead.bookName} · ${lastRead.chapter}`
    return tail.length > 42 ? `Продолжить чтение` : `Продолжить · ${tail}`
  }
  return `Осталось ${remaining} до полного круга`
}

function ChaptersProgressRing({ fraction }: { fraction: number }) {
  const offset = RING_C * (1 - Math.min(1, Math.max(0, fraction)))

  return (
    <svg className={styles.ringSvg} viewBox="0 0 36 36" role="presentation" aria-hidden>
      <defs>
        <linearGradient id="profileChaptersRingGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255, 214, 140, 0.95)" />
          <stop offset="55%" stopColor="rgba(212, 168, 75, 0.9)" />
          <stop offset="100%" stopColor="rgba(180, 130, 48, 0.88)" />
        </linearGradient>
      </defs>
      <circle className={styles.ringTrack} cx="18" cy="18" r={RING_R} />
      <circle
        className={styles.ringProgress}
        cx="18"
        cy="18"
        r={RING_R}
        strokeDasharray={RING_C}
        strokeDashoffset={offset}
      />
    </svg>
  )
}

export default function ProfileChaptersCard() {
  const queryClient = useQueryClient()
  const { readCount, fraction, lastRead, remainingToFullCanon } = useBibleReadingProgressSnapshot()
  const hasProgress = readCount > 0
  const subtitle = buildSubtitle(readCount, lastRead, String(remainingToFullCanon))

  return (
    <li
      className={[
        profileStyles.item,
        profileStyles.itemInteractive,
        profileStyles.chaptersCard,
        hasProgress ? profileStyles.chaptersCardActive : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Link
        href="/bible"
        prefetch
        className={profileStyles.itemLink}
        aria-label={
          hasProgress
            ? `Главы: прочитано ${readCount} из ${TOTAL_BIBLE_CHAPTERS}. ${subtitle}`
            : "Главы: открыть Библию и начать чтение"
        }
        onPointerEnter={() => prefetchTabBibleData(queryClient)}
        onFocus={() => prefetchTabBibleData(queryClient)}
        onTouchStart={() => prefetchTabBibleData(queryClient)}
      >
        <div className={styles.ringWrap}>
          <ChaptersProgressRing fraction={fraction} />
          <div className={`${styles.iconInRing} ${hasProgress ? styles.iconInRingMature : ""}`}>
            <Image className={styles.chaptersIconImg} src="/icon-chapters.svg" alt="" width={14} height={14} />
          </div>
        </div>
        <span className={styles.count}>{readCount}</span>
        <span className={profileStyles.rewardStatePlaceholder} aria-hidden />
        <p className={styles.subtitle}>{subtitle}</p>
      </Link>
    </li>
  )
}
