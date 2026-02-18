import MessageBubble from "@/components/MessageBubble";
import type { Message } from "@/types/message";
import styles from "./ChatWindow.module.scss";

type ChatWindowProps = {
  messages: Message[];
};

export default function ChatWindow({ messages }: ChatWindowProps) {
  return (
    <section className={styles.window}>
      {messages.length === 0 ? (
        <p className={styles.empty}>Сообщений пока нет.</p>
      ) : (
        messages.map((message) => <MessageBubble key={message.id} message={message} />)
      )}
    </section>
  );
}