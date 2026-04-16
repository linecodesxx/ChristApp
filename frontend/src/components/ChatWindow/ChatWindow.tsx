"use client"

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react"
import { useTranslations } from "next-intl"
import type { AppReactionType, Message } from "@/types/message"
import styles from "@/components/ChatWindow/ChatWindow.module.scss"
import MessageBubble from "@/components/MessageBubble/MessageBubble"

type ChatWindowProps = {
  messages: Message[]
  currentUsername?: string
  currentUser?: { id: string; username: string; nickname?: string } | null
  /** Аватарки співрозмовників (наприклад, у загальному чаті). */
  withSenderAvatars?: boolean
  resolveAvatarUrl?: (senderId: string) => string | undefined
  onAvatarClick?: (message: Message) => void
  onReplyMessage?: (message: Message) => void
  onDeleteMessage?: (message: Message) => void
  onEditMessage?: (message: Message) => void
  canDeleteOwnMessages?: boolean
  canModerateMessages?: boolean
  pinnedMessageIds?: string[]
  canPinMessages?: boolean
  onTogglePinMessage?: (message: Message) => void
  /** Прокрутка до повідомлення (для панелі закріпів під шапкою). */
  jumpToMessageRef?: MutableRefObject<((messageId: string) => void) | null>
  /** Контент над списком повідомлень (наприклад, привітання в особливому чаті). */
  topBanner?: ReactNode
  /** Статуси активності співрозмовників у кімнаті. */
  typingStatuses?: Array<{ username: string; activity: "text" | "voice" }>
  readReceiptMessageId?: string | null
  readReceiptUsersByMessageId?: Map<string, Array<{ id: string; avatarSrc?: string; label?: string }>>
  readReceiptAvatarSrc?: string
  readReceiptLabel?: string
  onToggleReaction?: (message: Message, reaction: AppReactionType) => void
  resolveReactionAvatarUrl?: (userId: string) => string | undefined
  resolveReactionUserLabel?: (userId: string) => string | undefined
  onMissingReferencedMessage?: (messageId: string) => void
  roomKey?: string
  /** Скільки останніх повідомлень вважати «recent» (нижче розділювача). */
  recentMessagesCount?: number
  hideSenderNames?: boolean
  hideOwnSenderName?: boolean
  senderNameMode?: "inline" | "compact-above"
}

/** Мінімум повідомлень у кімнаті, щоб показати лінію Recent. */
const MIN_MESSAGES_FOR_RECENT_LINE = 14
const DEFAULT_RECENT_MESSAGES_COUNT = 12
const SCROLL_DOWN_TRIGGER_MESSAGES = 20
const CHAT_VERTICAL_GAP_PX = 10

function ChatWindow({
  messages,
  currentUsername,
  currentUser,
  withSenderAvatars = false,
  resolveAvatarUrl,
  onAvatarClick,
  onReplyMessage,
  onDeleteMessage,
  onEditMessage,
  canDeleteOwnMessages = false,
  canModerateMessages = false,
  topBanner,
  typingStatuses = [],
  readReceiptMessageId,
  readReceiptUsersByMessageId,
  readReceiptAvatarSrc,
  readReceiptLabel,
  onToggleReaction,
  resolveReactionAvatarUrl,
  resolveReactionUserLabel,
  onMissingReferencedMessage,
  roomKey,
  recentMessagesCount = DEFAULT_RECENT_MESSAGES_COUNT,
  hideSenderNames = false,
  hideOwnSenderName = false,
  senderNameMode = "inline",
  pinnedMessageIds = [],
  canPinMessages = false,
  onTogglePinMessage,
  jumpToMessageRef,
}: ChatWindowProps) {
  const t = useTranslations("chat")
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const didInitialScrollRef = useRef(false)
  const messageRefs = useRef<Map<string, HTMLElement>>(new Map())
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const highlightTimerRef = useRef<number | null>(null)

  const formatTypingLine = (statuses: Array<{ username: string; activity: "text" | "voice" }>) => {
    if (statuses.length === 0) {
      return ""
    }
    if (statuses.length === 1) {
      const one = statuses[0]
      return one.activity === "voice"
        ? t("typingVoiceStatus", { name: one.username })
        : t("typingTextStatus", { name: one.username })
    }
    const names = statuses.map((item) => item.username)
    if (names.length === 2) {
      return t("typingTwo", { first: names[0], second: names[1] })
    }
    const last = names[names.length - 1]
    const head = names.slice(0, -1).join(", ")
    return t("typingMany", { head, last })
  }

  const recentSplitIndex = useMemo(() => {
    const n = messages.length
    const tail = Math.max(1, Math.min(recentMessagesCount, n - 1))
    if (n < MIN_MESSAGES_FOR_RECENT_LINE || tail >= n) {
      return null
    }
    return n - tail
  }, [messages.length, recentMessagesCount])

  useEffect(() => {
    didInitialScrollRef.current = false
    messageRefs.current.clear()
    setHighlightedMessageId(null)
    setShowScrollDown(false)
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = null
    }
  }, [roomKey])

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current)
      }
    }
  }, [])

  const typingStatusesKey = typingStatuses.map((item) => `${item.username}:${item.activity}`).join("|")

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: didInitialScrollRef.current ? "smooth" : "auto" })
    didInitialScrollRef.current = true
  }, [messages.length, typingStatusesKey])

  const estimateScrollDownThresholdPx = useCallback(() => {
    const lastMessages = messages.slice(-SCROLL_DOWN_TRIGGER_MESSAGES)
    if (lastMessages.length === 0) {
      return 0
    }

    const measuredHeight = lastMessages.reduce((total, message) => {
      const element = messageRefs.current.get(message.id)
      return total + (element?.offsetHeight ?? 0)
    }, 0)

    const fallbackAverageHeight = 76
    const fallbackHeight = fallbackAverageHeight * lastMessages.length
    const baseHeight = measuredHeight > 0 ? measuredHeight : fallbackHeight
    const gapHeight = Math.max(0, lastMessages.length - 1) * CHAT_VERTICAL_GAP_PX

    return baseHeight + gapHeight
  }, [messages])

  const updateScrollDownVisibility = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    const distanceFromBottom = container.scrollHeight - container.clientHeight - container.scrollTop
    const thresholdPx = estimateScrollDownThresholdPx()
    setShowScrollDown(distanceFromBottom > thresholdPx)
  }, [estimateScrollDownThresholdPx])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    const onScroll = () => updateScrollDownVisibility()
    container.addEventListener("scroll", onScroll, { passive: true })
    updateScrollDownVisibility()

    return () => {
      container.removeEventListener("scroll", onScroll)
    }
  }, [updateScrollDownVisibility])

  useEffect(() => {
    updateScrollDownVisibility()
  }, [messages.length, updateScrollDownVisibility])

  const typingLine = formatTypingLine(typingStatuses)
  const typingBlock =
    typingLine !== "" ? (
      <div className={styles.typingLane} role="status" aria-live="polite">
        <span className={styles.typingLaneText}>{typingLine}</span>
        <span className={styles.typingDots} aria-hidden>
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
        </span>
      </div>
    ) : null

  const setMessageRef = (messageId: string, element: HTMLElement | null) => {
    if (!element) {
      messageRefs.current.delete(messageId)
      return
    }
    messageRefs.current.set(messageId, element)
  }

  const navigateToReferencedMessage = useCallback(
    (messageId: string) => {
      const target = messageRefs.current.get(messageId)
      if (!target) {
        onMissingReferencedMessage?.(messageId)
        return
      }

      target.scrollIntoView({ behavior: "smooth", block: "center" })
      setHighlightedMessageId(messageId)
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current)
      }
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedMessageId((prev) => (prev === messageId ? null : prev))
      }, 1700)
    },
    [onMissingReferencedMessage],
  )

  useEffect(() => {
    if (!jumpToMessageRef) {
      return
    }
    jumpToMessageRef.current = navigateToReferencedMessage
    return () => {
      jumpToMessageRef.current = null
    }
  }, [jumpToMessageRef, navigateToReferencedMessage])

  const renderBubble = (message: Message) => (
    <div key={message.id} ref={(element) => setMessageRef(message.id, element)}>
      {(() => {
        const readReceiptUsers = readReceiptUsersByMessageId?.get(message.id) ?? []
        return (
      <MessageBubble
        message={message}
        currentUsername={currentUsername}
        currentUser={currentUser}
        avatarSrc={
          withSenderAvatars && message.senderId ? resolveAvatarUrl?.(message.senderId) : undefined
        }
        onAvatarClick={withSenderAvatars ? onAvatarClick : undefined}
        onReply={onReplyMessage}
        onReplyPreviewClick={navigateToReferencedMessage}
        onDelete={onDeleteMessage}
        onEdit={onEditMessage}
        canDeleteOwnMessage={canDeleteOwnMessages}
        canDeleteAnyMessage={canModerateMessages}
        showReadReceipt={Boolean(readReceiptUsers.length || (readReceiptMessageId && readReceiptMessageId === message.id))}
        readReceiptUsers={readReceiptUsers}
        readReceiptAvatarSrc={readReceiptAvatarSrc}
        readReceiptLabel={readReceiptLabel}
        onToggleReaction={onToggleReaction}
        resolveReactionAvatarUrl={resolveReactionAvatarUrl}
        resolveReactionUserLabel={resolveReactionUserLabel}
        isHighlighted={highlightedMessageId === message.id}
        hideSenderName={hideSenderNames}
        hideOwnSenderName={hideOwnSenderName}
        senderNameMode={senderNameMode}
        isPinned={pinnedMessageIds.includes(message.id)}
        showPinControl={canPinMessages}
        onTogglePin={onTogglePinMessage}
      />
        )
      })()}
    </div>
  )

  const handleScrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [])

  return (
    <div className={styles.chatWindowFrame}>
      <div className={styles.chatWindow} ref={scrollContainerRef}>
        {topBanner ? <div className={styles.topBanner}>{topBanner}</div> : null}
        {messages.length === 0 ? (
          <>
            <p className={styles.empty}>{topBanner ? "" : t("chatEmpty")}</p>
            {typingBlock}
            <div ref={bottomRef} />
          </>
        ) : (
          <>
            {recentSplitIndex == null ? (
              messages.map((message) => renderBubble(message))
            ) : (
              <>
                {messages.slice(0, recentSplitIndex).map((message) => renderBubble(message))}
                <div
                  className={styles.recentDivider}
                  role="separator"
                  aria-label={t("recentDividerAria")}
                >
                  <span className={styles.recentDividerLine} aria-hidden />
                  <span className={styles.recentDividerLabel}>{t("recentDividerLabel")}</span>
                  <span className={styles.recentDividerLine} aria-hidden />
                </div>
                {messages.slice(recentSplitIndex).map((message) => renderBubble(message))}
              </>
            )}
            {typingBlock}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {showScrollDown ? (
        <button
          type="button"
          className={styles.scrollDownButton}
          onClick={handleScrollToBottom}
          aria-label={t("scrollToLatestAria")}
          title={t("scrollToLatest")}
        >
          <span aria-hidden>↓</span>
          <span>{t("scrollToLatest")}</span>
        </button>
      ) : null}
    </div>
  )
}

export default memo(ChatWindow)
