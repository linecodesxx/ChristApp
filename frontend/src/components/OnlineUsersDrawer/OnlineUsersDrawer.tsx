"use client"

import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback"
import { getInitials } from "@/lib/utils"
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl"
import styles from "./OnlineUsersDrawer.module.scss"

type DrawerUser = {
  id: string
  username: string
  nickname?: string | null
  avatarUrl?: string | null
  isOnline: boolean
}

type OnlineUsersDrawerProps = {
  open: boolean
  title?: string
  participants: DrawerUser[]
  onClose: () => void
  onParticipantClick?: (participant: DrawerUser) => void
}

export default function OnlineUsersDrawer({
  open,
  title = "Участники",
  participants,
  onClose,
  onParticipantClick,
}: OnlineUsersDrawerProps) {
  if (!open) return null

  const sorted = [...participants].sort((a, b) => {
    if (a.isOnline === b.isOnline) return 0
    return a.isOnline ? -1 : 1
  })

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <aside className={styles.drawer} onClick={(event) => event.stopPropagation()} aria-label={title}>
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Закрыть список участников">
            ×
          </button>
        </div>
        <ul className={styles.list}>
          {sorted.map((participant) => (
            <li
              key={participant.id}
              className={`${styles.item} ${onParticipantClick ? styles.itemClickable : ""}`}
              onClick={() => onParticipantClick?.(participant)}
            >
              <AvatarWithFallback
                src={resolvePublicAvatarUrl(participant.avatarUrl)}
                initials={getInitials(participant.nickname ?? participant.username)}
                colorSeed={participant.id}
                width={34}
                height={34}
                imageClassName={styles.avatarImg}
                fallbackClassName={styles.avatarFallback}
                fallbackTag="span"
                fallbackTint="onError"
              />
              <span className={styles.name}>{participant.nickname ?? participant.username}</span>
              <span
                className={`${styles.statusDot} ${participant.isOnline ? styles.statusDotOnline : styles.statusDotOffline}`}
                aria-label={participant.isOnline ? "online" : "offline"}
                title={participant.isOnline ? "В сети" : "Не в сети"}
              />
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
