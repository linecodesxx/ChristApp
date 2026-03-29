"use client"

import { useRef, type MouseEvent, type TouchEvent } from "react"
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback"
import { type Message, isMessageFromCurrentUser } from "@/types/message"
import { useHydrated } from "@/hooks/useHydrated"
import { getInitials } from "@/lib/utils"
import styles from "@/components/MessageBubble/MessageBubble.module.scss"
import { buildVerseReference, parseVerseSharePayload } from "@/lib/verseShareMessage"
import { parseVoiceMessageUrl } from "@/lib/voiceMessage"

type MessageBubbleProps = {
  message: Message
  currentUsername?: string
  currentUser?: { id: string; username: string; nickname?: string } | null
  avatarSrc?: string
  onAvatarClick?: (message: Message) => void
  onReply?: (message: Message) => void
  onDelete?: (message: Message) => void
  canDeleteOwnMessage?: boolean
}

const SWIPE_REPLY_THRESHOLD = 56
const SWIPE_MAX_VERTICAL_DELTA = 42

export default function MessageBubble({
  message,
  currentUsername,
  currentUser,
  avatarSrc,
  onAvatarClick,
  onReply,
  onDelete,
  canDeleteOwnMessage = false,
}: MessageBubbleProps) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const skipNextClickRef = useRef(false)
  const hydrated = useHydrated()

  const date = new Date(message.createdAt)
  const formattedDate = hydrated
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "\u2007"

  const isOwnMessage = currentUser
    ? isMessageFromCurrentUser(message, currentUser)
    : message.sender === "me" ||
      (Boolean(currentUsername) && message.username === currentUsername) ||
      message.username === "Ты"

  const bubble = isOwnMessage ? `${styles.bubble} ${styles.myBubble}` : styles.bubble

  const showAvatar = Boolean(avatarSrc || (onAvatarClick && message.senderId && !isOwnMessage))

  const handleReplyIntent = () => {
    onReply?.(message)
  }

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    const firstTouch = event.touches[0]
    if (!firstTouch) return

    touchStartRef.current = { x: firstTouch.clientX, y: firstTouch.clientY }
  }

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return

    const touch = event.changedTouches[0]
    if (!touch) return

    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    const isHorizontalSwipe = Math.abs(deltaY) < SWIPE_MAX_VERTICAL_DELTA

    if (deltaX > SWIPE_REPLY_THRESHOLD && isHorizontalSwipe) {
      skipNextClickRef.current = true
      handleReplyIntent()
    }
  }

  const handleClick = () => {
    if (skipNextClickRef.current) {
      skipNextClickRef.current = false
      return
    }

    handleReplyIntent()
  }

  const handleDeleteClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onDelete?.(message)
  }

  const handleAvatarClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!isOwnMessage && message.senderId) {
      onAvatarClick?.(message)
    }
  }

  const bubbleBody = (
    <>
      {message.replyTo ? (
        <div className={styles.replyPreview}>
          <span className={styles.replyAuthor}>{message.replyTo.username}</span>
          <span className={styles.replyText}>{message.replyTo.content}</span>
        </div>
      ) : null}

      {(() => {
        const voiceUrl = parseVoiceMessageUrl(message.content)
        if (voiceUrl) {
          return (
            <div className={styles.voiceMessage}>
              <p className={styles.voiceMessageMeta}>
                <strong>{message.username || "Unknown"}</strong>
                <span> — голосовое</span>
              </p>
              <audio className={styles.voicePlayer} controls src={voiceUrl} preload="metadata" />
            </div>
          )
        }

        const verseShare = parseVerseSharePayload(message.content)
        if (!verseShare.payload) {
          return (
            <p className={styles.messageContent}>
              <strong>{message.username || "Unknown"}:</strong> {message.content}
            </p>
          )
        }

        return (
          <div className={styles.verseShareCard}>
            <p className={styles.verseShareAuthor}>{message.username || "Unknown"} поделился стихом</p>
            <p className={styles.verseShareReference}>{buildVerseReference(verseShare.payload)}</p>
            <p className={styles.verseShareText}>{verseShare.payload.text}</p>
          </div>
        )
      })()}

      <div className={styles.metaRow}>
        {isOwnMessage && canDeleteOwnMessage ? (
          <button
            type="button"
            className={styles.deleteButton}
            onClick={handleDeleteClick}
            aria-label="Удалить сообщение"
            title="Удалить сообщение"
          >
            Удалить
          </button>
        ) : null}

        <span className={styles.date}>{formattedDate}</span>
      </div>
    </>
  )

  if (isOwnMessage) {
    return (
      <article className={bubble} onClick={handleClick} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {bubbleBody}
      </article>
    )
  }

  if (showAvatar) {
    return (
      <article className={styles.row} onClick={handleClick} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <button
          type="button"
          className={styles.avatarBtn}
          onClick={handleAvatarClick}
          aria-label={`Написать ${message.handle ? `@${message.handle}` : message.username}`}
        >
          <AvatarWithFallback
            src={avatarSrc}
            initials={getInitials(message.username)}
            colorSeed={message.senderId ?? message.username ?? "?"}
            width={36}
            height={36}
            imageClassName={styles.avatarImg}
            fallbackClassName={styles.avatarFallback}
            fallbackTag="span"
            fallbackTint="onError"
          />
        </button>
        <div className={bubble}>{bubbleBody}</div>
      </article>
    )
  }

  return (
    <article className={bubble} onClick={handleClick} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {bubbleBody}
    </article>
  )
}
