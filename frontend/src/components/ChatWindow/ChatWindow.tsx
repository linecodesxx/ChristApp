import { useEffect, useRef, type ReactNode } from "react"
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
}

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

export default function ChatWindow({
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
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const didInitialScrollRef = useRef(false)

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
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              currentUsername={currentUsername}
              currentUser={currentUser}
              avatarSrc={
                withSenderAvatars && message.senderId
                  ? resolveAvatarUrl?.(message.senderId)
                  : undefined
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
          ))}
          {typingBlock}
          <div ref={bottomRef} />
        </>
      )}
    </div>
  )
}
