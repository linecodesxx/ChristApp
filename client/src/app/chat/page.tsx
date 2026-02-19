"use client"

import { useEffect, useState } from "react"
import { io, Socket } from "socket.io-client"
import ChatWindow from "@components/ChatWindow"
import MessageInput from "@components/MessageInput"
import type { Message } from "@/types/message"
import styles from "./page.module.scss"
import ChatList from "@components/ChatList/page"

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    const token = localStorage.getItem("token")

    const newSocket = io("http://localhost:3001", {
      auth: { token },
    })

    newSocket.on("connect", () => {
      console.log("Connected to server")
      newSocket.emit("getHistory")
    })

    newSocket.on("history", (data: Message[]) => {
      setMessages(data)
    })

    newSocket.on("newMessage", (message: Message) => {
      setMessages((prev) => [...prev, message])
    })

    setSocket(newSocket)

    return () => {
      newSocket.disconnect()
    }
  }, [])

  const handleSend = async (text: string): Promise<void> => {
    if (!socket) return
    socket.emit("sendMessage", text)
  }

  return (
    <main className={`${styles.main} container`}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.avatar}>JS</div>
          <div className={styles.wrapContent}>
            <h2 className={styles.chatName}>ОБЩИЙ ЧАТ - ДЛЯ ВСЕХ</h2>
            <span className={styles.status}>Online now</span>
          </div>
        </div>
      </div>

      <ChatWindow messages={messages} />
      <MessageInput onSend={handleSend} />
    </main>
  )
}
