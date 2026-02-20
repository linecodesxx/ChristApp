"use client"

import { useEffect, useState } from "react"
import { io, Socket } from "socket.io-client"
import ChatWindow from "@components/chatwindow/chatwindow"
import MessageInput from "@components/messageinput/messageinput"
import type { Message } from "@/types/message"
import styles from "./page.module.scss"
import ChatList from "@components/chatlist/chatlist"

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [socket, setSocket] = useState<Socket | null>(null)
  const [onlineUsers, setOnlineUsers] = useState(0)

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

    newSocket.on("onlineCount", (count) => {
      setOnlineUsers(count);
    });

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
    <section className={styles.chat}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.avatar}>JS</div>
          <div className={styles.wrapContent}>
            <h2 className={styles.chatName}>ОБЩИЙ ЧАТ - ДЛЯ ВСЕХ</h2>
            <span className={styles.status}>{onlineUsers} в сети</span>
          </div>
        </div>
      </div>

      <ChatWindow messages={messages} />
      <MessageInput onSend={handleSend} />
    </section>
  )
}
