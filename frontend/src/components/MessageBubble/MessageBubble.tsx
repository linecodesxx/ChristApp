"use client"

import { useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from "react"
import { memo } from "react"
import Image from "next/image"
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback"
import { type Message, isMessageFromCurrentUser } from "@/types/message"
import { useHydrated } from "@/hooks/useHydrated"
import { getInitials } from "@/lib/utils"
import styles from "@/components/MessageBubble/MessageBubble.module.scss"
import { buildVerseReference, parseVerseSharePayload } from "@/lib/verseShareMessage"
import { VOICE_META_PREFIX, VOICE_META_SUFFIX } from "@/lib/voiceMessage"
import { parseStickerMessagePayload } from "@/lib/stickerMessage"
import VoiceMessageBubble from "@/components/VoiceMessageBubble/VoiceMessageBubble"

type MessageBubbleProps = {
  message: Message
  currentUsername?: string
  currentUser?: { id: string; username: string; nickname?: string } | null
  avatarSrc?: string
  onAvatarClick?: (message: Message) => void
  onReply?: (message: Message) => void
  onDelete?: (message: Message) => void
  onEdit?: (message: Message) => void
  canDeleteOwnMessage?: boolean
  showReadReceipt?: boolean
  readReceiptAvatarSrc?: string
  readReceiptLabel?: string
  onToggleReaction?: (message: Message, reaction: "🤍" | "😂" | "❤️" | "🔥" | "😊") => void
  onReplyPreviewClick?: (replyMessageId: string) => void
  resolveReactionAvatarUrl?: (userId: string) => string | undefined
  resolveReactionUserLabel?: (userId: string) => string | undefined
  isHighlighted?: boolean
}

const SWIPE_REPLY_THRESHOLD = 56
const SWIPE_MAX_VERTICAL_DELTA = 42
const REACTION_OPTIONS: Array<"🤍" | "😂" | "❤️" | "🔥" | "😊"> = ["🤍", "😂", "❤️", "🔥", "😊"]

function MessageBubble({
  message,
  currentUsername,
  currentUser,
  avatarSrc,
  onAvatarClick,
  onReply,
  onDelete,
  onEdit,
  canDeleteOwnMessage = false,
  showReadReceipt = false,
  readReceiptAvatarSrc,
  readReceiptLabel = "Просмотрено",
  onToggleReaction,
  onReplyPreviewClick,
  resolveReactionAvatarUrl,
  resolveReactionUserLabel,
  isHighlighted = false,
}: MessageBubbleProps) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const skipNextClickRef = useRef(false)
  const reactionPickerRef = useRef<HTMLDivElement | null>(null)
  const hydrated = useHydrated()
  const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false)

  const date = new Date(message.createdAt)
  const formattedDate = hydrated
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : "\u2007"

  const isOwnMessage = currentUser
    ? isMessageFromCurrentUser(message, currentUser)
    : message.sender === "me" ||
      (Boolean(currentUsername) && message.username === currentUsername) ||
      message.username === "Ты"

  const stickerPayload = parseStickerMessagePayload(message.content)
  const stickerImagePath = stickerPayload?.path ?? null
  const bubble =
    isOwnMessage
      ? `${styles.bubble} ${styles.myBubble} ${stickerPayload ? styles.stickerBubble : ""}`
      : `${styles.bubble} ${stickerPayload ? styles.stickerBubble : ""}`

  const showAvatar = Boolean(avatarSrc || (onAvatarClick && message.senderId && !isOwnMessage))

  const reactionGroups = useMemo(() => {
    const grouped = new Map<
      "🤍" | "😂" | "❤️" | "🔥" | "😊",
      { emoji: "🤍" | "😂" | "❤️" | "🔥" | "😊"; count: number; reactedByMe: boolean; latestUserId: string }
    >()
    const currentUserId = currentUser?.id
    const allowed = new Set(REACTION_OPTIONS)
    for (const reaction of message.reactions ?? []) {
      if (!allowed.has(reaction.type)) continue
      const emoji = reaction.type as "🤍" | "😂" | "❤️" | "🔥" | "😊"
      const existing = grouped.get(emoji)
      if (existing) {
        existing.count += 1
        existing.latestUserId = reaction.userId
        if (currentUserId && reaction.userId === currentUserId) {
          existing.reactedByMe = true
        }
        continue
      }
      grouped.set(emoji, {
        emoji,
        count: 1,
        reactedByMe: Boolean(currentUserId && reaction.userId === currentUserId),
        latestUserId: reaction.userId,
      })
    }
    return REACTION_OPTIONS.map((emoji) => grouped.get(emoji)).filter(Boolean) as Array<{
      emoji: "🤍" | "😂" | "❤️" | "🔥" | "😊"
      count: number
      reactedByMe: boolean
      latestUserId: string
    }>
  }, [currentUser?.id, message.reactions])

  useEffect(() => {
    if (!isReactionPickerOpen) return
    const handlePointerDownOutside = (event: MouseEvent | globalThis.MouseEvent | TouchEvent | globalThis.TouchEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (reactionPickerRef.current?.contains(target)) return
      setIsReactionPickerOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDownOutside)
    document.addEventListener("touchstart", handlePointerDownOutside)
    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside)
      document.removeEventListener("touchstart", handlePointerDownOutside)
    }
  }, [isReactionPickerOpen])

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

  const handleReactionPickerToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setIsReactionPickerOpen((prev) => !prev)
  }

  const handleReactionClick = (event: MouseEvent<HTMLButtonElement>, reaction: "🤍" | "😂" | "❤️" | "🔥" | "😊") => {
    event.stopPropagation()
    onToggleReaction?.(message, reaction)
    setIsReactionPickerOpen(false)
  }

  const handleAvatarClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!isOwnMessage && message.senderId) {
      onAvatarClick?.(message)
    }
  }

  const handleEditClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onEdit?.(message)
  }

  const handleReplyPreviewClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (message.replyTo?.id) {
      onReplyPreviewClick?.(message.replyTo.id)
    }
  }

  const articleClassName = `${bubble} ${isHighlighted ? styles.highlightedBubble : ""}`

  const bubbleBody = (
    <>
      {message.replyTo ? (
        <button type="button" className={styles.replyPreview} onClick={handleReplyPreviewClick}>
          <span className={styles.replyAuthor}>{message.replyTo.username}</span>
          <span className={styles.replyText}>{message.replyTo.content}</span>
        </button>
      ) : null}

      {(() => {
        if (stickerPayload) {
          return (
            <div className={styles.stickerMessage}>
              {stickerImagePath ? (
                <Image
                  src={stickerImagePath}
                  alt="Стикер"
                  width={120}
                  height={120}
                  className={styles.stickerImage}
                  loading="lazy"
                />
              ) : (
                <span className={styles.stickerFallback} aria-label="Стикер">
                  🙂
                </span>
              )}
            </div>
          )
        }

        const imgUrl = message.fileUrl?.trim()
        if (message.type === "IMAGE" && imgUrl) {
          return (
            <div className={styles.imageMessage}>
              <p className={styles.imageMessageMeta}>
                <strong>{message.username || "Unknown"}</strong>
                <span> — фото</span>
              </p>
              <a
                className={styles.imageLink}
                href={imgUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- внешний Cloudinary URL */}
                <img src={imgUrl} alt="" className={styles.chatImage} loading="lazy" />
              </a>
            </div>
          )
        }

        const rawUrl = message.content.trim()
        if (rawUrl.startsWith(VOICE_META_PREFIX) && rawUrl.endsWith(VOICE_META_SUFFIX)) {
          const cleanUrl = rawUrl.replace(VOICE_META_PREFIX, "").replace(VOICE_META_SUFFIX, "")
          let playerSrc = cleanUrl
          try {
            playerSrc = decodeURIComponent(cleanUrl)
          } catch {
            /* бэкенд кладёт encodeURIComponent(URL); если строка уже «голая» — оставляем cleanUrl */
          }
          return (
            <VoiceMessageBubble
              username={message.username || "Unknown"}
              src={playerSrc}
              isOwn={isOwnMessage}
              message={message}
            />
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
        <div className={styles.metaActions}>
          {isOwnMessage && onEdit && message.type !== "VOICE" && message.type !== "IMAGE" ? (
            <button
              type="button"
              className={styles.metaActionButton}
              onClick={handleEditClick}
              aria-label="Изменить сообщение"
              title="Изменить сообщение"
            >
              Изменить
            </button>
          ) : null}
          {isOwnMessage && canDeleteOwnMessage ? (
            <button
              type="button"
              className={styles.metaActionButton}
              onClick={handleDeleteClick}
              aria-label="Удалить сообщение"
              title="Удалить сообщение"
            >
              Удалить
            </button>
          ) : null}
        </div>

        <span className={styles.date}>
          {formattedDate}
          {message.isEdited ? " · изменено" : ""}
        </span>
        {onToggleReaction ? (
          <div className={styles.reactionAnchor} ref={reactionPickerRef}>
            <button
              type="button"
              className={styles.reactionTrigger}
              onClick={handleReactionPickerToggle}
              aria-label="Добавить реакцию"
              title="Добавить реакцию"
            >
              +
            </button>
            {isReactionPickerOpen ? (
              <div className={styles.reactionPicker}>
                {REACTION_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={styles.emojiButton}
                    onClick={(event) => handleReactionClick(event, emoji)}
                    aria-label={`Реакция ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {reactionGroups.length > 0 ? (
        <div className={styles.messageReactions}>
          {reactionGroups.map((reaction) => (
            <button
              key={reaction.emoji}
              type="button"
              className={`${styles.reactionBadge} ${reaction.reactedByMe ? styles.reactionBadgeActive : ""}`}
              onClick={(event) => handleReactionClick(event, reaction.emoji)}
              aria-label={`Реакция ${reaction.emoji} (${reaction.count})`}
            >
              {reaction.emoji}
              {reaction.latestUserId ? (
                <AvatarWithFallback
                  src={resolveReactionAvatarUrl?.(reaction.latestUserId)}
                  initials={getInitials(resolveReactionUserLabel?.(reaction.latestUserId) ?? "U")}
                  colorSeed={reaction.latestUserId}
                  width={12}
                  height={12}
                  imageClassName={styles.reactionAvatarImg}
                  fallbackClassName={styles.reactionAvatarFallback}
                  fallbackTag="span"
                  fallbackTint="onError"
                />
              ) : null}
              <span>{reaction.count}</span>
            </button>
          ))}
        </div>
      ) : null}
      {isOwnMessage && showReadReceipt ? (
        <div className={styles.readReceiptRow} aria-label={readReceiptLabel}>
          <AvatarWithFallback
            src={readReceiptAvatarSrc}
            initials="•"
            colorSeed={message.id}
            width={12}
            height={12}
            imageClassName={styles.readReceiptAvatarImg}
            fallbackClassName={styles.readReceiptAvatarFallback}
            fallbackTag="span"
            fallbackTint="onError"
          />
          <span className={styles.readReceiptText}>{readReceiptLabel}</span>
        </div>
      ) : null}
    </>
  )

  if (isOwnMessage) {
    return (
      <article className={articleClassName} onClick={handleClick} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
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
    <article className={articleClassName} onClick={handleClick} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {bubbleBody}
    </article>
  )
}

export default memo(MessageBubble)
