import { useEffect, useRef } from "react"
import type { Message } from "@/types/message"
import styles from "@/components/ChatWindow/ChatWindow.module.scss"
import MessageBubble from "@/components/MessageBubble/MessageBubble"

type ChatWindowProps = {
  messages: Message[]
  currentUsername?: string
  onReplyMessage?: (message: Message) => void
  onDeleteMessage?: (message: Message) => void
  canDeleteOwnMessages?: boolean
}

export default function ChatWindow({
  messages,
  currentUsername,
  onReplyMessage,
  onDeleteMessage,
  canDeleteOwnMessages = false,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <div className={styles.chatWindow}>
      {messages.length === 0 ? (
        <p className={styles.empty}>Сообщений пока нет.</p>
      ) : (
        <>
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              currentUsername={currentUsername}
              onReply={onReplyMessage}
              onDelete={onDeleteMessage}
              canDeleteOwnMessage={canDeleteOwnMessages}
            />
          ))}
          <div ref={bottomRef} />
        </>
      )}
    </div>
  )
}
