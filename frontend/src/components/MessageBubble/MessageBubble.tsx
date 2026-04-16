"use client"

import { AnimatePresence, motion } from "framer-motion"
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent, type TouchEvent } from "react"
import Image from "next/image"
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback"
import { type AppReactionType, type Message, isMessageFromCurrentUser } from "@/types/message"
import { useTranslations } from "next-intl"
import { useHydrated } from "@/hooks/useHydrated"
import { CHAT_COMPOSER_TAB_LAYOUT_MAX_WIDTH_PX, useMediaQuery } from "@/hooks/useMediaQuery"
import { PenLine, Pin, PinOff, Trash2 } from "lucide-react"
import { useLongPress } from "@/hooks/useLongPress"
import { getInitials } from "@/lib/utils"
import styles from "@/components/MessageBubble/MessageBubble.module.scss"
import { buildVerseReference, parseVerseSharePayload } from "@/lib/verseShareMessage"
import { Link } from "@/i18n/navigation"
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
  hideSenderName?: boolean
  hideOwnSenderName?: boolean
  senderNameMode?: "inline" | "compact-above"
  isPinned?: boolean
  showPinControl?: boolean
  onTogglePin?: (message: Message) => void
}

const SWIPE_REPLY_THRESHOLD = 56
const SWIPE_MAX_VERTICAL_DELTA = 42
const REACTION_OPTIONS: AppReactionType[] = ["🤍", "😂", "❤️", "🔥", "😊", "😧", "🥲"]

function isAudioFileName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase()
  return ext === "mp3" || ext === "m4a"
}

function isBookFileName(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase()
  return ext === "pdf" || ext === "epub"
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, "0")}`
}

function BookFileBubble({ href, filename }: { href: string; filename: string }) {
  const ext = filename.split(".").pop()?.toUpperCase() ?? "FILE"
  return (
    <a
      className={styles.bookFileBubble}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      <span className={styles.bookFileIcon} aria-hidden>
        📖
      </span>
      <span className={styles.bookFileInfo}>
        <span className={styles.bookFileName}>{filename}</span>
        <span className={styles.bookFileExt}>{ext}</span>
      </span>
    </a>
  )
}

function AudioFileBubble({ src, filename }: { src: string; filename: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onMeta = () => setDuration(audio.duration)
    const onTime = () => setCurrentTime(audio.currentTime)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0) }
    audio.addEventListener("loadedmetadata", onMeta)
    audio.addEventListener("timeupdate", onTime)
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)
    audio.addEventListener("ended", onEnded)
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta)
      audio.removeEventListener("timeupdate", onTime)
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
      audio.removeEventListener("ended", onEnded)
    }
  }, [])

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) audio.pause()
    else void audio.play()
  }

  const handleSeek = (e: ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    const audio = audioRef.current
    if (!audio) return
    const val = parseFloat(e.target.value)
    audio.currentTime = val
    setCurrentTime(val)
  }

  return (
    <div className={styles.audioFileBubble} data-bubble-control>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={src} preload="metadata" />
      <p className={styles.audioFileTitle}>
        <span className={styles.audioFileIcon} aria-hidden>♪</span>
        <span className={styles.audioFileName}>{filename}</span>
      </p>
      <div className={styles.audioFileControls}>
        <button
          type="button"
          className={styles.audioPlayButton}
          onClick={toggle}
          aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <input
          type="range"
          className={styles.audioFileProgress}
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          onClick={(e) => e.stopPropagation()}
          aria-label="Прогресс воспроизведения"
        />
        <span className={styles.audioFileTime}>
          {duration > 0 ? `${fmtTime(currentTime)} / ${fmtTime(duration)}` : fmtTime(currentTime)}
        </span>
      </div>
    </div>
  )
}

function SenderName({ name, isVip, as }: { name: string; isVip: boolean; as: "strong" | "span" }) {
  const Tag = as
  if (!isVip) {
    return <Tag>{name}</Tag>
  }
  return (
    <Tag>
      <span className={styles.vipName}>{name}</span>
    </Tag>
  )
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  return Boolean(target.closest("button, a, input, textarea, select, audio, video, [data-bubble-control]"))
}

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
  hideSenderName = false,
  hideOwnSenderName = false,
  senderNameMode = "inline",
  isPinned = false,
  showPinControl = false,
  onTogglePin,
}: MessageBubbleProps) {
  const t = useTranslations("chat")
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const skipNextClickRef = useRef(false)
  const hydrated = useHydrated()
  const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false)
  const showReactionPlusButton = useMediaQuery("(min-width: 1024px)", false)

  /** Планшет/мобилка: без «+», реакции по тапу по пузырю. Десктоп (шире брейкпоинта) — как раньше с «+». */
  const isNarrowViewport = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(`(max-width: ${CHAT_COMPOSER_TAB_LAYOUT_MAX_WIDTH_PX}px)`).matches

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

  const closeOtherReactionPickers = useCallback(() => {
    window.dispatchEvent(new Event("chat:close-reaction-pickers"))
  }, [])

  useEffect(() => {
    const onCloseAll = () => setIsReactionPickerOpen(false)
    window.addEventListener("chat:close-reaction-pickers", onCloseAll)
    return () => window.removeEventListener("chat:close-reaction-pickers", onCloseAll)
  }, [])

  const openReactionPickerFromGesture = useCallback(() => {
    if (!onToggleReaction || isReactionPickerOpen) return

    skipNextClickRef.current = true
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(50)
    }
    closeOtherReactionPickers()
    setIsReactionPickerOpen(true)
  }, [closeOtherReactionPickers, isReactionPickerOpen, onToggleReaction])

  const longPressHandlers = useLongPress<HTMLElement>(openReactionPickerFromGesture, {
    ms: 360,
    moveThreshold: 24,
  })

  const handleReplyIntent = () => {
    onReply?.(message)
  }

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (isInteractiveTarget(event.target)) {
      touchStartRef.current = null
      return
    }

    longPressHandlers.onTouchStart(event)

    const firstTouch = event.touches[0]
    if (!firstTouch) return

    touchStartRef.current = { x: firstTouch.clientX, y: firstTouch.clientY }
  }

  const handleTouchMove = (event: TouchEvent<HTMLElement>) => {
    if (isInteractiveTarget(event.target)) {
      return
    }

    longPressHandlers.onTouchMove(event)
  }

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    if (isInteractiveTarget(event.target)) {
      touchStartRef.current = null
      return
    }

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

  const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
    if (!isNarrowViewport()) {
      return
    }

    if (isInteractiveTarget(event.target)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    openReactionPickerFromGesture()
  }

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (isInteractiveTarget(event.target)) {
      return
    }

    if (skipNextClickRef.current) {
      skipNextClickRef.current = false
      return
    }

    if (onToggleReaction && isNarrowViewport()) {
      setIsReactionPickerOpen((prev) => {
        if (prev) return false
        closeOtherReactionPickers()
        return true
      })
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
    setIsReactionPickerOpen((prev) => {
      if (prev) return false
      closeOtherReactionPickers()
      return true
    })
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

  const bubbleClassName = `${bubble} ${isHighlighted ? styles.highlightedBubble : ""} ${isPinned ? styles.bubblePinned : ""}`
  const reactionPickerOpen = Boolean(onToggleReaction && isReactionPickerOpen)
  const interactiveBubbleProps = {
    onClick: handleClick,
    onContextMenu: handleContextMenu,
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
        const senderName = message.username || "Unknown"
        const senderVip = Boolean(message.senderIsVip) && !isOwnMessage
        const canShowSenderName =
          !hideSenderName && !(hideOwnSenderName && isOwnMessage)
        const showCompactSender = senderNameMode === "compact-above" && canShowSenderName

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
              {showCompactSender ? (
                <p className={styles.senderCompact}>
                  <SenderName name={senderName} isVip={senderVip} as="span" />
                </p>
              ) : null}
              {canShowSenderName && !showCompactSender ? (
                <p className={styles.imageMessageMeta}>
                  <SenderName name={senderName} isVip={senderVip} as="strong" />
                  <span> — фото</span>
                </p>
              ) : null}
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

        if (message.type === "FILE" && imgUrl) {
          const fallbackName = (() => {
            const raw = message.content?.trim()
            if (raw) {
              return raw
            }
            try {
              const pathname = new URL(imgUrl).pathname
              const segment = pathname.split("/").filter(Boolean).pop()
              return segment ? decodeURIComponent(segment) : "file"
            } catch {
              return "file"
            }
          })()

          if (isAudioFileName(fallbackName)) {
            return (
              <div className={styles.fileMessage}>
                {showCompactSender ? (
                  <p className={styles.senderCompact}>
                    <SenderName name={senderName} isVip={senderVip} as="span" />
                  </p>
                ) : null}
                {canShowSenderName && !showCompactSender ? (
                  <p className={styles.fileMessageMeta}>
                    <SenderName name={senderName} isVip={senderVip} as="strong" />
                    <span> — музыка</span>
                  </p>
                ) : null}
                <AudioFileBubble src={imgUrl} filename={fallbackName} />
              </div>
            )
          }

          if (isBookFileName(fallbackName)) {
            return (
              <div className={styles.fileMessage}>
                {showCompactSender ? (
                  <p className={styles.senderCompact}>
                    <SenderName name={senderName} isVip={senderVip} as="span" />
                  </p>
                ) : null}
                {canShowSenderName && !showCompactSender ? (
                  <p className={styles.fileMessageMeta}>
                    <SenderName name={senderName} isVip={senderVip} as="strong" />
                    <span> — книга</span>
                  </p>
                ) : null}
                <BookFileBubble href={imgUrl} filename={fallbackName} />
              </div>
            )
          }

          return (
            <div className={styles.fileMessage}>
              {showCompactSender ? (
                <p className={styles.senderCompact}>
                  <SenderName name={senderName} isVip={senderVip} as="span" />
                </p>
              ) : null}
              {canShowSenderName && !showCompactSender ? (
                <p className={styles.fileMessageMeta}>
                  <SenderName name={senderName} isVip={senderVip} as="strong" />
                  <span> — файл</span>
                </p>
              ) : null}
              <a
                className={styles.fileLink}
                href={imgUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                {fallbackName}
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
              username={senderName}
              src={playerSrc}
              isOwn={isOwnMessage}
              message={message}
              hideSenderName={showCompactSender || !canShowSenderName}
              compactSenderLabel={showCompactSender ? senderName : undefined}
              senderIsVip={senderVip}
            />
          )
        }

        const verseShare = parseVerseSharePayload(message.content)
        if (!verseShare.payload) {
          const showInlineAuthor = canShowSenderName && !showCompactSender
          return (
            <>
              {showCompactSender ? (
                <p className={styles.senderCompact}>
                  <SenderName name={senderName} isVip={senderVip} as="span" />
                </p>
              ) : null}
              <p className={styles.messageContent}>
                {showInlineAuthor ? (
                  <>
                    <SenderName name={senderName} isVip={senderVip} as="strong" />
                    <span>:</span>
                  </>
                ) : null}
                {showInlineAuthor ? " " : null}
                {message.content}
              </p>
            </>
          )
        }

        return (
          <>
            {showCompactSender ? (
              <p className={styles.senderCompact}>
                <SenderName name={senderName} isVip={senderVip} as="span" />
              </p>
            ) : null}
            {verseShare.payload.bookId ? (
              <Link
                href={`/bible/${verseShare.payload.bookId}?chapter=${verseShare.payload.chapter}&verse=${verseShare.payload.verses[0]}`}
                className={styles.verseShareCard}
              >
                {canShowSenderName && !showCompactSender ? (
                  <p className={styles.verseShareAuthor}>
                    <SenderName name={senderName} isVip={senderVip} as="span" /> поделился стихом
                  </p>
                ) : null}
                <p className={styles.verseShareReference}>{buildVerseReference(verseShare.payload)}</p>
                <ScriptureText html={verseShare.payload.text} className={styles.verseShareText} />
              </Link>
            ) : (
              <div className={styles.verseShareCard}>
                {canShowSenderName && !showCompactSender ? (
                  <p className={styles.verseShareAuthor}>
                    <SenderName name={senderName} isVip={senderVip} as="span" /> поделился стихом
                  </p>
                ) : null}
                <p className={styles.verseShareReference}>{buildVerseReference(verseShare.payload)}</p>
                <ScriptureText html={verseShare.payload.text} className={styles.verseShareText} />
              </div>
            )}
          </>
        )
      })()}

      <div className={styles.metaRow}>
        <div className={styles.metaActions}>
          {showPinControl && onTogglePin ? (
            <button
              type="button"
              className={`${styles.metaActionIcon} ${isPinned ? styles.metaActionIconPinned : ""}`}
              data-bubble-control
              onClick={(event) => {
                event.stopPropagation()
                onTogglePin(message)
              }}
              aria-label={isPinned ? t("unpinMessageAria") : t("pinMessageAria")}
              title={isPinned ? t("unpinMessage") : t("pinMessage")}
            >
              {isPinned ? <PinOff size={15} strokeWidth={2.1} aria-hidden /> : <Pin size={15} strokeWidth={2.1} aria-hidden />}
            </button>
          ) : null}
          {isOwnMessage && onEdit && message.type !== "VOICE" && message.type !== "IMAGE" && message.type !== "FILE" ? (
            <button
              type="button"
              className={styles.metaActionIcon}
              onClick={handleEditClick}
              aria-label="Изменить сообщение"
              title="Изменить сообщение"
            >
              <PenLine size={15} strokeWidth={2.1} aria-hidden />
            </button>
          ) : null}
          {isOwnMessage && canDeleteOwnMessage ? (
            <button
              type="button"
              className={styles.metaActionIcon}
              onClick={handleDeleteClick}
              aria-label="Удалить сообщение"
              title="Удалить сообщение"
            >
              <Trash2 size={15} strokeWidth={2.1} aria-hidden />
            </button>
          ) : null}
        </div>

        <div className={styles.metaRowTrailing}>
          {onToggleReaction ? (
            <div className={styles.reactionAnchor}>
              {showReactionPlusButton ? (
                <button
                  type="button"
                  className={styles.reactionTrigger}
                  onClick={handleReactionPickerToggle}
                  aria-label="Добавить реакцию"
                  title="Добавить реакцию"
                >
                  +
                </button>
              ) : null}
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
          <span className={styles.date}>
            {formattedDate}
            {message.isEdited ? " · изменено" : ""}
          </span>
        </div>
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
      <article
        className={bubbleClassName}
        data-reaction-picker-open={reactionPickerOpen ? "" : undefined}
        {...interactiveBubbleProps}
      >
        {bubbleBody}
      </article>
    )
  }

  if (showAvatar) {
    return (
      <article className={styles.row} data-reaction-picker-open={reactionPickerOpen ? "" : undefined}>
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
    <article
      className={bubbleClassName}
      data-reaction-picker-open={reactionPickerOpen ? "" : undefined}
      {...interactiveBubbleProps}
    >
      {bubbleBody}
    </article>
  )
}

export default memo(MessageBubble)
