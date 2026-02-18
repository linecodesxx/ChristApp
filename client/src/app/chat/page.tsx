"use client"

import { useEffect, useState } from "react"
import ChatWindow from "@/components/ChatWindow"
import MessageInput from "@/components/MessageInput"
import TabBar from "@/components/TabBar"
import type { Message } from "@/types/message"
import styles from "./page.module.scss"

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])

  useEffect(() => {
    const loadMessages = async () => {
      const response = await fetch("/api/messages", { cache: "no-store" })
      if (!response.ok) return
      const data = (await response.json()) as { messages: Message[] }
      setMessages(data.messages)
    }

    void loadMessages()
  }, [])

  const handleSend = async (text: string) => {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, author: "Ты" }),
    })

    if (!response.ok) return
    const data = (await response.json()) as { message: Message }
    setMessages((prev) => [...prev, data.message])
  }

  return (
    <main className={`${styles.main} container`}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.avatar}>JS</div>
          <div className={styles.wrapContent}>
            <h2 className={styles.chatName}>Чат с Иисусом</h2>
            <span className={styles.status}>Online now</span>
          </div>
        </div>
      </div>
      <ChatWindow messages={messages} />
      <MessageInput onSend={handleSend} />
    </main>
  )
}
