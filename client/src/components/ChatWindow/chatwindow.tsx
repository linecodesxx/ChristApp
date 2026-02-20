import MessageBubble from "@components/messagebubble/messagebubble"
import type { Message } from "@/types/message"
import styles from "@/components/chatwindow/chatwindow.module.scss"

type ChatWindowProps = {
  messages: Message[]
}

export default function ChatWindow({ messages }: ChatWindowProps) {
  
  return (
    <div className={styles.chatWindow}>
      {messages.length === 0 ? (
        <p className={styles.empty}>Сообщений пока нет.</p>
      ) : (
        messages.map((message) => <MessageBubble key={message.id} message={message} />)
      )}
    </div>
  )
}
