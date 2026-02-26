"use client"

import ChatWindow from "@/components/ChatWindow/ChatWindow"
import styles from "./chatRoom.module.scss"
import MessageInput from "@/components/MessageInput/MessageInput"
import type { Message } from "@/types/message"
import { useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { useParams, useRouter } from "next/navigation"
import { getInitials } from "@/lib/utils"
import { useAuth } from "@/hooks/useAuth"
import { getAuthToken } from "@/lib/auth"
import Link from "next/link"
import Image from "next/image"

const WS_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
const GLOBAL_ROOM_ID = "00000000-0000-0000-0000-000000000001"

function normalizeIncomingMessage(raw: any, currentUsername?: string): Message {
  const username = raw?.username ?? raw?.sender?.username ?? "Unknown"

  return {
    id: String(raw?.id ?? Date.now()),
    content: String(raw?.content ?? ""),
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
    username,
    sender: username === currentUsername ? "me" : undefined,
  }
}

function getReadableRoomTitle(
  roomId?: string,
  rawTitle?: string,
  currentUserId?: string,
  users?: Array<{ id: string; username: string }>,
) {
  if (roomId === GLOBAL_ROOM_ID) return "Общий чат для всех"

  if (!rawTitle?.trim()) return "Личный чат"

  if (rawTitle.startsWith("dm:")) {
    const directIds = rawTitle.split(":").slice(1)
    const otherUserId = directIds.find((id) => id !== currentUserId)
    const otherUser = users?.find((existingUser) => existingUser.id === otherUserId)
    return otherUser ? `Чат с ${otherUser.username}` : "Личный чат"
  }

  return rawTitle
}

export default function ChatPageDetails() {
  const { user, users, loading } = useAuth({ redirectIfUnauthenticated: "/" })
  const socketRef = useRef<Socket | null>(null)
  const currentRoomRef = useRef<string | undefined>(undefined)
  const joinedRoomRef = useRef<string | undefined>(undefined)
  const availableRoomIdsRef = useRef<Set<string>>(new Set())
  const openingDirectRoomRef = useRef<Set<string>>(new Set())
  const [messages, setMessages] = useState<Message[]>([])
  const [roomTitle, setRoomTitle] = useState<string>("")

  const params = useParams<{ roomId: string }>()
  const router = useRouter()
  const roomId = params?.roomId

  useEffect(() => {
    console.info("[ChatRoom] route opened", roomId)
    setMessages([])
    setRoomTitle("")
  }, [roomId])

  useEffect(() => {
    if (loading) {
      console.info("[ChatRoom] auth check in progress")
      return
    }

    if (!user) {
      console.warn("[ChatRoom] unauthenticated, redirecting")
      return
    }

    console.info("[ChatRoom] authenticated as", user.username)
  }, [loading, user])

  useEffect(() => {
    if (loading || !user || !roomId) return

    if (roomId === user.id) {
      console.warn("[ChatRoom] self chat is not allowed, redirecting to global room")
      router.replace(`/chat/${GLOBAL_ROOM_ID}`)
    }
  }, [loading, user, roomId, router])

  useEffect(() => {
    if (loading) return

    if (socketRef.current) {
      return
    }

    const token = getAuthToken()
    if (!token) {
      console.error("[ChatRoom] no token")
      return
    }

    const socket = io(WS_URL, {
      auth: { token },
      transports: ["websocket"],
    })

    socketRef.current = socket

    const onConnect = () => {
      console.info("[ChatRoom] socket connected", socket.id)

      const activeRoomId = currentRoomRef.current
      if (activeRoomId === GLOBAL_ROOM_ID && joinedRoomRef.current !== activeRoomId) {
        console.info("[ChatRoom] emit joinRoom (global on connect)", activeRoomId)
        socket.emit("joinRoom", { roomId: activeRoomId, limit: 50, skip: 0 })
        joinedRoomRef.current = activeRoomId
      }

      console.info("[ChatRoom] emit getMyRooms (on connect)")
      socket.emit("getMyRooms")
    }
    socket.on("connect", onConnect)

    const onDisconnect = (reason: string) => {
      console.info("[ChatRoom] socket disconnected", reason)
      joinedRoomRef.current = undefined
    }
    socket.on("disconnect", onDisconnect)

    const onSocketError = (error: unknown) => {
      console.error("[ChatRoom] socket error:", error)
    }
    socket.on("connect_error", onSocketError)
    socket.on("error", onSocketError)

    const onNewMessage = (msg: unknown) => {
      const normalized = normalizeIncomingMessage(msg, user?.username)
      console.info("[ChatRoom] newMessage", normalized.id)
      setMessages((prev) => {
        if (prev.some((existingMessage) => existingMessage.id === normalized.id)) {
          return prev
        }
        return [...prev, normalized]
      })
    }
    socket.on("newMessage", onNewMessage)

    const onRoomHistory = ({ messages: history }: { messages: unknown[] }) => {
      const normalizedHistory = (history ?? []).map((messageItem) => normalizeIncomingMessage(messageItem, user?.username))
      const uniqueHistory = normalizedHistory.filter(
        (messageItem, index, array) => array.findIndex((candidate) => candidate.id === messageItem.id) === index,
      )

      console.info("[ChatRoom] roomHistory loaded", uniqueHistory.length)
      setMessages(uniqueHistory)
    }
    socket.on("roomHistory", onRoomHistory)

    const onUserJoinedRoom = ({ username }: { username: string }) => {
      console.info("[ChatRoom] userJoinedRoom", username)
    }
    socket.on("userJoinedRoom", onUserJoinedRoom)

    const onUserLeftRoom = ({ username }: { username: string }) => {
      console.info("[ChatRoom] userLeftRoom", username)
    }
    socket.on("userLeftRoom", onUserLeftRoom)

    const onMyRooms = ({ rooms }: { rooms: Array<{ id: string; title: string; createdAt: string }> }) => {
      console.info("[ChatRoom] myRooms", rooms.length)
      availableRoomIdsRef.current = new Set(rooms.map((room) => room.id))

      const activeRoomId = currentRoomRef.current
      const currentRoom = rooms.find((room) => room.id === activeRoomId)

      if (!currentRoom && activeRoomId) {
        console.warn("[ChatRoom] room is not in myRooms, skip join", activeRoomId)

        const isGlobal = activeRoomId === GLOBAL_ROOM_ID
        const isSelfRoute = activeRoomId === user?.id
        const alreadyOpening = openingDirectRoomRef.current.has(activeRoomId)

        if (!isGlobal && !isSelfRoute && !alreadyOpening) {
          console.info("[ChatRoom] emit openDirectRoom", activeRoomId)
          openingDirectRoomRef.current.add(activeRoomId)
          socket.emit("openDirectRoom", { targetUserId: activeRoomId })
        }
      }

      if (currentRoom?.title) {
        setRoomTitle(getReadableRoomTitle(activeRoomId, currentRoom.title, user?.id, users))
      }

      if (currentRoom && activeRoomId && joinedRoomRef.current !== activeRoomId) {
        console.info("[ChatRoom] emit joinRoom (after myRooms)", activeRoomId)
        socket.emit("joinRoom", { roomId: activeRoomId, limit: 50, skip: 0 })
        joinedRoomRef.current = activeRoomId
      }
    }
    socket.on("myRooms", onMyRooms)

    const onDirectRoomOpened = (payload: {
      roomId: string
      targetUserId: string
      title?: string
      targetUsername?: string
    }) => {
      console.info("[ChatRoom] directRoomOpened", payload)
      openingDirectRoomRef.current.delete(payload.targetUserId)

      if (currentRoomRef.current === payload.targetUserId) {
        router.replace(`/chat/${payload.roomId}`)
        return
      }

      if (payload.targetUsername) {
        setRoomTitle(`Чат с ${payload.targetUsername}`)
      } else if (payload.title) {
        setRoomTitle(getReadableRoomTitle(payload.roomId, payload.title, user?.id, users))
      }
    }
    socket.on("directRoomOpened", onDirectRoomOpened)

    const onInvitedToRoom = ({ invitedUserId }: { invitedUserId: string }) => {
      void invitedUserId
      socket.emit("getMyRooms")
    }
    socket.on("userInvitedToRoom", onInvitedToRoom)

    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      socket.off("connect_error", onSocketError)
      socket.off("error", onSocketError)
      socket.off("newMessage", onNewMessage)
      socket.off("roomHistory", onRoomHistory)
      socket.off("userJoinedRoom", onUserJoinedRoom)
      socket.off("userLeftRoom", onUserLeftRoom)
      socket.off("myRooms", onMyRooms)
      socket.off("directRoomOpened", onDirectRoomOpened)
      socket.off("userInvitedToRoom", onInvitedToRoom)
      const activeRoomId = currentRoomRef.current
      if (activeRoomId) {
        console.info("[ChatRoom] emit leaveRoom", activeRoomId)
        socket.emit("leaveRoom", activeRoomId)
      }
      joinedRoomRef.current = undefined
      socket.disconnect()
      socketRef.current = null
    }
  }, [loading, router, user?.id, users])

  useEffect(() => {
    if (loading || !roomId) return

    const prevRoomId = currentRoomRef.current
    currentRoomRef.current = roomId

    const socket = socketRef.current
    if (!socket) {
      console.warn("[ChatRoom] socket not ready yet")
      return
    }

    if (!socket.connected) {
      console.info("[ChatRoom] waiting socket connect before getMyRooms")
      return
    }

    if (prevRoomId && prevRoomId !== roomId && joinedRoomRef.current === prevRoomId) {
      console.info("[ChatRoom] emit leaveRoom", prevRoomId)
      socket.emit("leaveRoom", prevRoomId)
      joinedRoomRef.current = undefined
    }

    if (roomId === GLOBAL_ROOM_ID && joinedRoomRef.current !== roomId) {
      console.info("[ChatRoom] emit joinRoom (global on route)", roomId)
      socket.emit("joinRoom", { roomId, limit: 50, skip: 0 })
      joinedRoomRef.current = roomId
      return
    }

    if (availableRoomIdsRef.current.has(roomId) && joinedRoomRef.current !== roomId) {
      console.info("[ChatRoom] emit joinRoom (known room on route)", roomId)
      socket.emit("joinRoom", { roomId, limit: 50, skip: 0 })
      joinedRoomRef.current = roomId
      return
    }

    if (!availableRoomIdsRef.current.has(roomId)) {
      console.info("[ChatRoom] room not available yet, requesting myRooms")
      socket.emit("getMyRooms")
      return
    }

    console.info("[ChatRoom] emit getMyRooms")
    socket.emit("getMyRooms")

    return () => {
      if (joinedRoomRef.current === roomId) {
        console.info("[ChatRoom] emit leaveRoom", roomId)
        socket.emit("leaveRoom", roomId)
        joinedRoomRef.current = undefined
      }
    }
  }, [roomId, loading])

  const resolvedTitle = roomTitle || getReadableRoomTitle(roomId, undefined, user?.id, users)

  async function handleSend(text: string) {
    if (!socketRef.current || !roomId || !text.trim()) return

    if (roomId === user?.id) {
      console.warn("[ChatRoom] sending to self is blocked")
      return
    }

    if (!availableRoomIdsRef.current.has(roomId) && roomId !== GLOBAL_ROOM_ID) {
      if (!openingDirectRoomRef.current.has(roomId)) {
        console.info("[ChatRoom] openDirectRoom before send", roomId)
        openingDirectRoomRef.current.add(roomId)
        socketRef.current.emit("openDirectRoom", { targetUserId: roomId })
      }
      return
    }

    // Отправляем на сервер
    console.info("[ChatRoom] emit sendMessage", { roomId, textLength: text.length })
    socketRef.current.emit("sendMessage", { roomId, content: text })
  }

  return (
    <section className={`${styles.chat} container`}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <Link href="/chat">
            <Image src="/back-icon.svg" alt="Back" width={24} height={24} />
          </Link>
          <div className={styles.avatar}>{getInitials(resolvedTitle)}</div>
          <div className={styles.wrapContent}>
            <h2 className={styles.chatName}>{resolvedTitle}</h2>
            <span className={styles.status}>Online now</span>
          </div>
        </div>
      </div>

      <ChatWindow messages={messages} currentUsername={user?.username} />
      <MessageInput onSend={handleSend} />
    </section>
  )
}
