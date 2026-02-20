import type { Message } from "@/types/message";
import styles from "./MessageBubble.module.scss";

type MessageBubbleProps = {
  message: Message;
};

export default function MessageBubble({ message }: MessageBubbleProps) {
  console.log(message.username);
  
  
  const bubbleClassName = message.sender === "me" ? `${styles.bubble} ${styles.myBubble}` : styles.bubble

  return (
    <article className={bubbleClassName}>
      <p>
        <strong>{message.username || "Unknown"}:</strong> {message.content}
      </p>
    </article>
  );
}