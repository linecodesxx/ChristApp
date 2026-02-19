import type { Message } from "@/types/message";
import styles from "./MessageBubble.module.scss";

type MessageBubbleProps = {
  message: Message;
};

export default function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <article className={styles.bubble}>
      <p>
        <strong>{message.username || "Unknown"}:</strong> {message.content}
      </p>
    </article>
  );
}