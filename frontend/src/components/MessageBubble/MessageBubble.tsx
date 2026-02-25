import type { Message } from "@/types/message"
import styles from "@/components/MessageBubble/MessageBubble.module.scss"
import { useAuth } from "@/hooks/useAuth"

type MessageBubbleProps = {
  message: Message
  createdAt: string
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const { user } = useAuth()

  const date = new Date(message.createdAt)
  const formattedDate = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  const bubble = message.username === user?.username ? `${styles.bubble} ${styles.myBubble}` : styles.bubble

  return (
    <article className={bubble}>
      <p className={styles.messageContent}>
        <strong>{message.username || "Unknown"}:</strong> {message.content}
        <span className={styles.date}>{formattedDate}</span>
      </p>
    </article>
  )
}
