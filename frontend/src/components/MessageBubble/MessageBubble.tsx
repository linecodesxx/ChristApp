import type { Message } from "@/types/message"
import styles from "@/components/MessageBubble/MessageBubble.module.scss"

type MessageBubbleProps = {
  message: Message
  currentUsername?: string
}

export default function MessageBubble({ message, currentUsername }: MessageBubbleProps) {

  const date = new Date(message.createdAt)
  const formattedDate = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  const isOwnMessage =
    message.sender === "me" ||
    (Boolean(currentUsername) && message.username === currentUsername) ||
    message.username === "Ты"

  const bubble = isOwnMessage ? `${styles.bubble} ${styles.myBubble}` : styles.bubble

  return (
    <article className={bubble}>
      <p className={styles.messageContent}>
        <strong>{message.username || "Unknown"}:</strong> {message.content}
        <span className={styles.date}>{formattedDate}</span>
      </p>
    </article>
  )
}
