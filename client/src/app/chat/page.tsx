"use client";

import { useEffect, useState } from "react";
import ChatWindow from "@/components/ChatWindow";
import MessageInput from "@/components/MessageInput";
import TabBar from "@/components/TabBar";
import type { Message } from "@/types/message";
import styles from "./page.module.scss";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const loadMessages = async () => {
      const response = await fetch("/api/messages", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { messages: Message[] };
      setMessages(data.messages);
    };

    void loadMessages();
  }, []);

  const handleSend = async (text: string) => {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, author: "Ты" }),
    });

    if (!response.ok) return;
    const data = (await response.json()) as { message: Message };
    setMessages((prev) => [...prev, data.message]);
  };

  return (
    <main className={`${styles.main} container`}>
      <h1>Общий чат</h1>
      <TabBar />
      <ChatWindow messages={messages} />
      <MessageInput onSend={handleSend} />
    </main>
  );
}