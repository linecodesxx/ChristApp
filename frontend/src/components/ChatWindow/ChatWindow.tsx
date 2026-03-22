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
  /** Имена собеседников, которые сейчас печатают (уже без текущего пользователя). */
  typingUsernames?: string[]
}

function formatTypingLine(names: string[]) {
  if (names.length === 0) return ""
  if (names.length === 1) return `${names[0]} печатает`
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
  typingUsernames = [],
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, typingUsernames.join("|")])

  const typingLine = formatTypingLine(typingUsernames)
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
            />
          ))}
          {typingBlock}
          <div ref={bottomRef} />
        </>
      )}
    </div>
  )
}
