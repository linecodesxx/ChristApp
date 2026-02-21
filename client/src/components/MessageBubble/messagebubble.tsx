import type { Message } from "@/types/message"
import styles from "@/components/MessageBubble/MessageBubble.module.scss"
import { useAuth } from "@/hooks/useAuth"

type MessageBubbleProps = {
  message: Message
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const { user } = useAuth()

  const bubbleClassName = message.username === user?.username ? `${styles.bubble} ${styles.myBubble}` : styles.bubble

  return (
    <article className={bubbleClassName}>
      <p>
        <strong>{message.username || "Unknown"}:</strong> {message.content}
      </p>
    </article>
  )
}
