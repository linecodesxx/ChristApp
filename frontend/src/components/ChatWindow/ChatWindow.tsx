import { memo, useEffect, useMemo, useRef, type ReactNode } from "react"
import type { Message } from "@/types/message"
import styles from "@/components/ChatWindow/ChatWindow.module.scss"
import MessageBubble from "@/components/MessageBubble/MessageBubble"

type ChatWindowProps = {
  messages: Message[]
  currentUsername?: string
  currentUser?: { id: string; username: string; nickname?: string } | null
  /** Аватарки собеседников (например в общем чате). */
  withSenderAvatars?: boolean
  resolveAvatarUrl?: (senderId: string) => string | undefined
  onAvatarClick?: (message: Message) => void
  onReplyMessage?: (message: Message) => void
  onDeleteMessage?: (message: Message) => void
  canDeleteOwnMessages?: boolean
  /** Контент над списком сообщений (например приветствие в особом чате). */
  topBanner?: ReactNode
  /** Статусы активности собеседников в комнате. */
  typingStatuses?: Array<{ username: string; activity: "text" | "voice" }>
  readReceiptMessageId?: string | null
  readReceiptAvatarSrc?: string
  readReceiptLabel?: string
  onToggleReaction?: (message: Message, reaction: "🤍" | "😂" | "❤️") => void
  roomKey?: string
  /** Сколько последних сообщений считать «recent» (ниже разделителя). */
  recentMessagesCount?: number
}

/** Минимум сообщений в комнате, чтобы показать линию Recent. */
const MIN_MESSAGES_FOR_RECENT_LINE = 14
const DEFAULT_RECENT_MESSAGES_COUNT = 12

function formatTypingLine(statuses: Array<{ username: string; activity: "text" | "voice" }>) {
  if (statuses.length === 0) return ""
  if (statuses.length === 1) {
    const one = statuses[0]
    return one.activity === "voice" ? `${one.username} записывает голосовое` : `${one.username} печатает`
  }
  const names = statuses.map((item) => item.username)
  if (names.length === 2) return `${names[0]} и ${names[1]} печатают`
  return `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]} печатают`
}

function ChatWindow({
  messages,
  currentUsername,
  currentUser,
  withSenderAvatars = false,
  resolveAvatarUrl,
  onAvatarClick,
  onReplyMessage,
  onDeleteMessage,
  canDeleteOwnMessages = false,
  topBanner,
  typingStatuses = [],
  readReceiptMessageId,
  readReceiptAvatarSrc,
  readReceiptLabel,
  onToggleReaction,
  roomKey,
  recentMessagesCount = DEFAULT_RECENT_MESSAGES_COUNT,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const didInitialScrollRef = useRef(false)

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
  }, [roomKey])

  const typingStatusesKey = typingStatuses.map((item) => `${item.username}:${item.activity}`).join("|")

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: didInitialScrollRef.current ? "smooth" : "auto" })
    didInitialScrollRef.current = true
  }, [messages, typingStatusesKey])

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

  const renderBubble = (message: Message) => (
    <MessageBubble
      key={message.id}
      message={message}
      currentUsername={currentUsername}
      currentUser={currentUser}
      avatarSrc={
        withSenderAvatars && message.senderId ? resolveAvatarUrl?.(message.senderId) : undefined
      }
      onAvatarClick={withSenderAvatars ? onAvatarClick : undefined}
      onReply={onReplyMessage}
      onDelete={onDeleteMessage}
      canDeleteOwnMessage={canDeleteOwnMessages}
      showReadReceipt={Boolean(readReceiptMessageId && readReceiptMessageId === message.id)}
      readReceiptAvatarSrc={readReceiptAvatarSrc}
      readReceiptLabel={readReceiptLabel}
      onToggleReaction={onToggleReaction}
    />
  )

  return (
    <div className={styles.chatWindow}>
      {topBanner ? <div className={styles.topBanner}>{topBanner}</div> : null}
      {messages.length === 0 ? (
        <>
          <p className={styles.empty}>{topBanner ? "" : "Сообщений пока нет."}</p>
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
                aria-label="Недавние сообщения ниже"
              >
                <span className={styles.recentDividerLine} aria-hidden />
                <span className={styles.recentDividerLabel}>Recent</span>
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
  )
}

export default memo(ChatWindow)
