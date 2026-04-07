import { useEffect, useLayoutEffect, useState } from "react"
import {
  BIBLE_LAST_READ_STORAGE_KEY,
  BIBLE_READING_PROGRESS_CHANGED_EVENT,
  BIBLE_READ_CHAPTERS_STORAGE_KEY,
  TOTAL_BIBLE_CHAPTERS,
  type BibleLastRead,
  getBibleReadingProgressSnapshot,
} from "@/lib/bibleReadingProgress"

type ProgressSnapshot = ReturnType<typeof getBibleReadingProgressSnapshot>

const EMPTY_SNAPSHOT: ProgressSnapshot = {
  readCount: 0,
  fraction: 0,
  lastRead: null,
  remainingToFullCanon: TOTAL_BIBLE_CHAPTERS,
}

function lastReadEqual(a: BibleLastRead | null, b: BibleLastRead | null) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.bookId === b.bookId &&
    a.chapter === b.chapter &&
    a.bookName === b.bookName
  )
}

function snapshotEqual(prev: ProgressSnapshot, next: ProgressSnapshot) {
  return (
    prev.readCount === next.readCount &&
    prev.fraction === next.fraction &&
    prev.remainingToFullCanon === next.remainingToFullCanon &&
    lastReadEqual(prev.lastRead, next.lastRead)
  )
}

function mergeSnapshot(prev: ProgressSnapshot): ProgressSnapshot {
  const next = getBibleReadingProgressSnapshot()
  return snapshotEqual(prev, next) ? prev : next
}

export function useBibleReadingProgressSnapshot(): ProgressSnapshot {
  const [snap, setSnap] = useState<ProgressSnapshot>(EMPTY_SNAPSHOT)

  useLayoutEffect(() => {
    setSnap((prev) => mergeSnapshot(prev))
  }, [])

  useEffect(() => {
    const bump = () => {
      setSnap((prev) => mergeSnapshot(prev))
    }

    if (typeof window === "undefined") return

    const onStorage = (event: StorageEvent) => {
      if (
        event.key === BIBLE_READ_CHAPTERS_STORAGE_KEY ||
        event.key === BIBLE_LAST_READ_STORAGE_KEY ||
        event.key === null
      ) {
        bump()
      }
    }

    window.addEventListener("storage", onStorage)
    window.addEventListener(BIBLE_READING_PROGRESS_CHANGED_EVENT, bump)

    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(BIBLE_READING_PROGRESS_CHANGED_EVENT, bump)
    }
  }, [])

  return snap
}
