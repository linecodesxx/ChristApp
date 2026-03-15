import { useRef, type MouseEvent, type TouchEvent } from "react"
import type { Message } from "@/types/message"
import styles from "@/components/MessageBubble/MessageBubble.module.scss"

type MessageBubbleProps = {
  message: Message
  currentUsername?: string
  onReply?: (message: Message) => void
  onDelete?: (message: Message) => void
  canDeleteOwnMessage?: boolean
}

const SWIPE_REPLY_THRESHOLD = 56
const SWIPE_MAX_VERTICAL_DELTA = 42

export default function MessageBubble({
  message,
  currentUsername,
  onReply,
  onDelete,
  canDeleteOwnMessage = false,
}: MessageBubbleProps) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const skipNextClickRef = useRef(false)

  const date = new Date(message.createdAt)
  const formattedDate = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  const isOwnMessage =
    message.sender === "me" ||
    (Boolean(currentUsername) && message.username === currentUsername) ||
    message.username === "Ты"

  const bubble = isOwnMessage ? `${styles.bubble} ${styles.myBubble}` : styles.bubble

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

  return (
    <article className={bubble} onClick={handleClick} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {message.replyTo ? (
        <div className={styles.replyPreview}>
          <span className={styles.replyAuthor}>{message.replyTo.username}</span>
          <span className={styles.replyText}>{message.replyTo.content}</span>
        </div>
      ) : null}

      <p className={styles.messageContent}>
        <strong>{message.username || "Unknown"}:</strong> {message.content}
      </p>

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
    </article>
  )
}
