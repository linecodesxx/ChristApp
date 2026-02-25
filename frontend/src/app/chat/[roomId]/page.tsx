"use client"

import ChatWindow from "@/components/ChatWindow/ChatWindow"
import styles from "./chatRoom.module.scss"
import MessageInput from "@/components/MessageInput/MessageInput"
import type { Message } from "@/types/message"
import chat from "@app/chatlist/chats.json"
import { useState } from "react"
import { useParams } from "next/navigation"

export default function ChatPageDetails() {
  const params = useParams<{ roomId: string }>()
  const roomId = params?.roomId
  const id = Number(roomId)

  const chatData = chat.find((item) => item.id === id)
  const initialMessages: Message[] = chatData?.messages ?? []
  const [messages, setMessages] = useState<Message[]>(initialMessages)

  if (!chatData) {
    return (
      <div className="container">
        <h1 style={{ textAlign: "center" }}>Чат не найден</h1>
      </div>
    )
  }

  const avatarInitials = chatData.title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase()

  async function handleSend(text: string) {
    const newMessage: Message = {
      id: Date.now().toString(),
      username: "Ты",
      content: text,
      createdAt: new Date().toISOString(),
      sender: "me",
    }

    setMessages((prev) => [...prev, newMessage])
  }

  return (
    <main className={`${styles.main} container`}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.avatar}>{avatarInitials}</div>
          <div className={styles.wrapContent}>
            <h2 className={styles.chatName}>Чат с {chatData?.title}</h2>
            <span className={styles.status}>Online now</span>
          </div>
        </div>
      </div>

      <ChatWindow messages={messages} />
      <MessageInput onSend={handleSend} />
    </main>
  )
}
