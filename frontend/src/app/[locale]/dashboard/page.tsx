"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import { canSeeDashboardNav } from "@/lib/adminDashboardNav"
import RandomVerseWidget from "@/components/RandomVerseWidget/RandomVerseWidget"
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback"
import { getAppStreak } from "@/lib/appStreak"
import {
  BIBLE_READING_PROGRESS_CHANGED_EVENT,
  readBibleLastReadFromStorage,
  type BibleLastRead,
} from "@/lib/bibleReadingProgress"
import { getInitials } from "@/lib/utils"
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl"
import { GLOBAL_CHAT_AVATAR_SRC, GLOBAL_ROOM_ID, getDirectTargetUserId, isShareWithJesusRoomTitle } from "@/lib/chatRooms"
import { chatMyRoomsQueryKey } from "@/lib/chatRoomsQuery"
import { chatMessagePreview } from "@/lib/chatMessagePreview"
import { normalizeNotificationBody } from "@/lib/notifications"
import { fetchUnreadSummaryForQuery, pushUnreadSummaryQueryKey } from "@/lib/queries/pushQueries"
import { usersDirectoryQueryKey } from "@/lib/queries/usersQueries"
import { loadRecentVerseNotesAcrossCollections } from "@/lib/verseNotesStorage"
import styles from "./dashboard.module.scss"

function greetingDisplayName(user: { nickname?: string | null; username: string }): string {
  const n = user.nickname?.trim()
  return n || user.username
}

function normKey(id: string) {
  return id.trim().toLowerCase()
}

type DashboardRoomMeta = {
  id: string
  title: string
  directPeer?: {
    id: string
    username: string
    nickname?: string | null
    avatarUrl?: string | null
  }
}

type DashboardDirectoryUser = {
  id: string
  username?: string
  nickname?: string | null
  avatarUrl?: string | null
}

function dashboardChatHref(
  roomId: string,
  myRooms: DashboardRoomMeta[] | undefined,
  currentUserId: string | undefined,
): string {
  if (normKey(roomId) === normKey(GLOBAL_ROOM_ID)) {
    return "/chat/global"
  }
  const meta = myRooms?.find((r) => normKey(r.id) === normKey(roomId))
  if (meta && isShareWithJesusRoomTitle(meta.title)) {
    return "/chat/share-with-jesus"
  }
  const target = meta && currentUserId ? getDirectTargetUserId(meta.title, currentUserId) : undefined
  if (target) {
    return `/chat/${normKey(target)}`
  }
  return `/chat/${roomId}`
}

export default function DashboardPage() {
  const t = useTranslations("dashboard")
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user, loading } = useAuth()
  const [streak, setStreak] = useState(0)
  const [lastRead, setLastRead] = useState<BibleLastRead | null>(null)

  const unreadQuery = useQuery({
    queryKey: pushUnreadSummaryQueryKey(user?.id),
    queryFn: fetchUnreadSummaryForQuery,
    enabled: Boolean(user?.id),
    staleTime: 30_000,
  })

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

  const recentChatRows = useMemo(() => {
    const myRoomsCached = queryClient.getQueryData<DashboardRoomMeta[]>(chatMyRoomsQueryKey(user?.id))
    const usersDirectoryCached = queryClient.getQueryData<DashboardDirectoryUser[]>(usersDirectoryQueryKey())
    const usersById = new Map((usersDirectoryCached ?? []).map((u) => [normKey(u.id), u]))
    const rooms = unreadQuery.data?.rooms ?? []
    const rows = rooms
      .filter((r) => normKey(r.roomId) !== normKey(GLOBAL_ROOM_ID))
      .filter((r) => r.lastMessage)
      .slice(0, 3)
    return rows.map((r) => {
      const lm = r.lastMessage!
      const roomMeta = myRoomsCached?.find((room) => normKey(room.id) === normKey(r.roomId))
      const directTargetUserId = getDirectTargetUserId(roomMeta?.title ?? "", user?.id)
      const directTarget = directTargetUserId ? usersById.get(normKey(directTargetUserId)) : undefined
      const directPeerName = roomMeta?.directPeer
        ? roomMeta.directPeer.nickname?.trim() || roomMeta.directPeer.username?.trim() || ""
        : directTarget?.nickname?.trim() || directTarget?.username?.trim() || ""
      const stripped = normalizeNotificationBody(lm.content) || lm.content
      const preview = chatMessagePreview({ content: stripped }).trim()
      const youLast = user?.id && lm.senderId === user.id
      const title = youLast ? t("recentYouLast") : lm.senderUsername
      const href = dashboardChatHref(r.roomId, myRoomsCached, user?.id)
      const time = new Date(lm.createdAt)
      const timeLabel = Number.isNaN(time.getTime()) ? "" : time.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })

      let avatarImage: string | undefined
      let avatarInitials = getInitials(directPeerName || lm.senderUsername || "Чат")
      let avatarSeed = roomMeta?.directPeer?.id ?? directTarget?.id ?? r.roomId

      if (roomMeta && isShareWithJesusRoomTitle(roomMeta.title)) {
        avatarImage = "/jesus-say.svg"
        avatarInitials = getInitials("Иисус")
        avatarSeed = "share-with-jesus"
      } else if (roomMeta?.directPeer || directTarget) {
        avatarImage = resolvePublicAvatarUrl(roomMeta?.directPeer?.avatarUrl ?? directTarget?.avatarUrl)
      } else {
        avatarImage = GLOBAL_CHAT_AVATAR_SRC
        avatarInitials = getInitials(roomMeta?.title?.trim() || lm.senderUsername || "Чат")
      }

      return { key: r.roomId, href, title, preview, timeLabel, avatarImage, avatarInitials, avatarSeed }
    })
  }, [queryClient, t, unreadQuery.data?.rooms, unreadQuery.dataUpdatedAt, user?.id])

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
        <p className={styles.greetingHint}>
          {t("greetingHintBefore")}{" "}
          <Link href="/chat" className={styles.greetingChatLink} prefetch>
            {t("greetingChat")}
          </Link>
          {t("greetingHintAfter")}
        </p>
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

      <section className={styles.feedSection} aria-label={t("recentChatsTitle")}>
        <h2 className={styles.feedTitle}>{t("recentChatsTitle")}</h2>
        {recentChatRows.length === 0 ? (
          <p className={styles.feedEmpty}>{t("recentChatsEmpty")}</p>
        ) : (
          <ul className={styles.feedList}>
            {recentChatRows.map((row) => (
              <li key={row.key}>
                <Link href={row.href} className={styles.feedLink} prefetch>
                  <div className={styles.feedChatRow}>
                    <AvatarWithFallback
                      src={row.avatarImage}
                      initials={row.avatarInitials}
                      colorSeed={row.avatarSeed}
                      width={38}
                      height={38}
                      imageClassName={styles.feedChatAvatarImg}
                      fallbackClassName={styles.feedChatAvatarFallback}
                      alt={row.title}
                    />
                    <div className={styles.feedChatBody}>
                      <div className={styles.feedLinkTitle}>{row.title}</div>
                      {row.preview ? <div className={styles.feedNoteSnippet}>{row.preview}</div> : null}
                      {row.timeLabel ? <div className={styles.feedLinkMeta}>{row.timeLabel}</div> : null}
                    </div>
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
