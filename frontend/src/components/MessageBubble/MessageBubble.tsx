"use client"

import { AnimatePresence, motion } from "framer-motion"
import { memo, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from "react"
import Image from "next/image"
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback"
import { type AppReactionType, type Message, isMessageFromCurrentUser } from "@/types/message"
import { useHydrated } from "@/hooks/useHydrated"
import { useLongPress } from "@/hooks/useLongPress"
import { getInitials } from "@/lib/utils"
import styles from "@/components/MessageBubble/MessageBubble.module.scss"
import { buildVerseReference, parseVerseSharePayload } from "@/lib/verseShareMessage"
import { VOICE_META_PREFIX, VOICE_META_SUFFIX } from "@/lib/voiceMessage"
import { parseStickerMessagePayload } from "@/lib/stickerMessage"
import VoiceMessageBubble from "@/components/VoiceMessageBubble/VoiceMessageBubble"
import { ScriptureText } from "@/components/ScriptureText/ScriptureText"

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
  readReceiptUsers?: Array<{ id: string; avatarSrc?: string; label?: string }>
  readReceiptAvatarSrc?: string
  readReceiptLabel?: string
  onToggleReaction?: (message: Message, reaction: AppReactionType) => void
  onReplyPreviewClick?: (replyMessageId: string) => void
  resolveReactionAvatarUrl?: (userId: string) => string | undefined
  resolveReactionUserLabel?: (userId: string) => string | undefined
  isHighlighted?: boolean
}

const SWIPE_REPLY_THRESHOLD = 56
const SWIPE_MAX_VERTICAL_DELTA = 42
const REACTION_OPTIONS: AppReactionType[] = ["🤍", "😂", "❤️", "🔥", "😊", "😧", "🥲"]

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
  readReceiptUsers = [],
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
    const grouped = new Map<AppReactionType, { emoji: AppReactionType; count: number; reactedByMe: boolean; latestUserId: string }>()
    const currentUserId = currentUser?.id
    const allowed = new Set(REACTION_OPTIONS)
    for (const reaction of message.reactions ?? []) {
      if (!allowed.has(reaction.type)) continue
      const emoji = reaction.type as AppReactionType
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
      emoji: AppReactionType
      count: number
      reactedByMe: boolean
      latestUserId: string
    }>
  }, [currentUser?.id, message.reactions])

  const longPressHandlers = useLongPress<HTMLElement>(() => {
    if (!onToggleReaction || isReactionPickerOpen) return

    skipNextClickRef.current = true
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(50)
    }
    setIsReactionPickerOpen(true)
  })

  const handleReplyIntent = () => {
    onReply?.(message)
  }

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    longPressHandlers.onTouchStart(event)

    const firstTouch = event.touches[0]
    if (!firstTouch) return

    touchStartRef.current = { x: firstTouch.clientX, y: firstTouch.clientY }
  }

  const handleTouchMove = (event: TouchEvent<HTMLElement>) => {
    longPressHandlers.onTouchMove(event)
  }

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    longPressHandlers.onTouchEnd(event)

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

  const handleTouchCancel = (event: TouchEvent<HTMLElement>) => {
    longPressHandlers.onTouchCancel(event)
    touchStartRef.current = null
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

  const handleReactionPickerClose = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    setIsReactionPickerOpen(false)
  }

  const handleReactionClick = (event: MouseEvent<HTMLButtonElement>, reaction: AppReactionType) => {
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

  const bubbleClassName = `${bubble} ${isHighlighted ? styles.highlightedBubble : ""}`
  const interactiveBubbleProps = {
    onClick: handleClick,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchCancel,
  }

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
                {/* eslint-disable-next-line @next/next/no-img-element -- зовнішній Cloudinary URL */}
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
            /* бекенд кладе encodeURIComponent(URL); якщо рядок уже «голий» — лишаємо cleanUrl */
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
            <ScriptureText html={verseShare.payload.text} className={styles.verseShareText} />
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
          <div className={styles.reactionAnchor}>
            <button
              type="button"
              className={styles.reactionTrigger}
              onClick={handleReactionPickerToggle}
              aria-label="Добавить реакцию"
              title="Добавить реакцию"
            >
              +
            </button>
            <AnimatePresence>
              {isReactionPickerOpen ? (
                <>
                  <motion.button
                    key="reaction-overlay"
                    type="button"
                    className={styles.reactionOverlay}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    onClick={handleReactionPickerClose}
                    aria-label="Закрыть панель реакций"
                  />
                  <motion.div
                    key="reaction-picker"
                    className={styles.reactionPicker}
                    initial={{ opacity: 0, scale: 0.92, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                    transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.72 }}
                    onClick={(event) => event.stopPropagation()}
                  >
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
                  </motion.div>
                </>
              ) : null}
            </AnimatePresence>
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
          {readReceiptUsers.length > 0 ? (
            <>
              <span className={styles.readReceiptAvatarStack}>
                {readReceiptUsers.slice(0, 3).map((reader) => (
                  <AvatarWithFallback
                    key={reader.id}
                    src={reader.avatarSrc}
                    initials={getInitials(reader.label ?? "U")}
                    colorSeed={reader.id}
                    width={12}
                    height={12}
                    imageClassName={styles.readReceiptAvatarImg}
                    fallbackClassName={styles.readReceiptAvatarFallback}
                    fallbackTag="span"
                    fallbackTint="onError"
                  />
                ))}
              </span>
              <span className={styles.readReceiptText}>
                {readReceiptUsers.length === 1 ? readReceiptLabel : String(readReceiptUsers.length)}
              </span>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      ) : null}
    </>
  )

  if (isOwnMessage) {
    return (
      <article className={bubbleClassName} {...interactiveBubbleProps}>
        {bubbleBody}
      </article>
    )
  }

  if (showAvatar) {
    return (
      <article className={styles.row}>
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
        <div className={bubbleClassName} {...interactiveBubbleProps}>
          {bubbleBody}
        </div>
      </article>
    )
  }

  return (
    <article className={bubbleClassName} {...interactiveBubbleProps}>
      {bubbleBody}
    </article>
  )
}

export default memo(MessageBubble)
