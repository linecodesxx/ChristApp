import type { Message } from "@/types/message"
import styles from "@/components/messagebubble/messagebubble.module.scss"

type MessageBubbleProps = {
  message: Message
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const bubbleClassName = message.sender === "me" ? `${styles.bubble} ${styles.myBubble}` : styles.bubble

  return (
    <article className={bubbleClassName}>
      <p>
        <strong>{message.username || "Unknown"}:</strong> {message.content}
      </p>
    </article>
  )
}
