"use client"

import { useEffect, useRef, useState } from "react"
import { io } from "socket.io-client"
import ChatList, { type ChatListItem } from "@/components/ChatList/ChatList"
import { getInitials } from "@/lib/utils"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { getAuthToken } from "@/lib/auth"

const WS_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
const GLOBAL_ROOM_ID = "00000000-0000-0000-0000-000000000001"

function getReadableRoomTitle(roomId: string, rawTitle: string) {
  if (roomId === GLOBAL_ROOM_ID) return "Общий чат для всех"
  if (rawTitle?.startsWith("dm:")) return "Личный чат"
  return rawTitle?.trim() || "Личный чат"
}

type RoomSocketItem = {
  id: string
  title: string
}

type NewMessageSocketEvent = {
  roomId: string
  content: string
  createdAt: string
}

export default function ChatPage() {
  const { user, users, loading } = useAuth()
  const [rooms, setRooms] = useState<ChatListItem[]>([])
  const socketRef = useRef<ReturnType<typeof io> | null>(null)
  const activeRoomIdRef = useRef<string | null>(null)
  const fallbackRoomsRef = useRef<ChatListItem[]>([])
  const pathname = usePathname()
  const router = useRouter()

  const activeRoomId = pathname?.startsWith("/chat/") ? pathname.replace("/chat/", "") : null
  activeRoomIdRef.current = activeRoomId

  const fallbackRooms: ChatListItem[] = [
    {
      id: GLOBAL_ROOM_ID,
      title: "Общий чат для всех",
      avatarInitials: getInitials("Общий чат для всех"),
      href: `/chat/${GLOBAL_ROOM_ID}`,
      preview: "",
      timeLabel: "",
      unread: 0,
    },
    ...users
      .filter((userItem) => userItem.id !== user?.id)
      .map((userItem) => ({
      id: userItem.id,
      title: userItem.username,
      avatarInitials: getInitials(userItem.username),
      href: `/chat/${userItem.id}`,
      preview: userItem.email,
      timeLabel: "",
      unread: 0,
    })),
  ]

  useEffect(() => {
    console.info("[ChatPage] entered /chat")
  }, [])

  useEffect(() => {
    if (loading) {
      console.info("[ChatPage] auth check in progress")
      return
    }

    if (!user) {
      console.warn("[ChatPage] unauthenticated, redirecting")
      return
    }

    console.info("[ChatPage] authenticated as", user.username)
  }, [loading, user])

  useEffect(() => {
    fallbackRoomsRef.current = fallbackRooms

    setRooms((prev) => {
      const prevById = new Map(prev.map((room) => [room.id, room]))

      const withUsers = fallbackRooms.map((room) => {
        const prevRoom = prevById.get(room.id)
        return prevRoom
          ? {
              ...room,
              preview: prevRoom.preview ?? room.preview,
              timeLabel: prevRoom.timeLabel ?? room.timeLabel,
              unread: prevRoom.unread ?? room.unread,
            }
          : room
      })

      const extras = prev.filter((room) => !withUsers.some((item) => item.id === room.id))
      return [...withUsers, ...extras]
    })
  }, [users, user?.id])

  useEffect(() => {
    if (loading) return

    if (socketRef.current) {
      return
    }

    const token = getAuthToken()
    if (!token) {
      console.warn("[ChatPage] no token in storage")
      setRooms(fallbackRooms)
      return
    }

    const newSocket = io(WS_URL, {
      auth: { token },
      transports: ["websocket"],
    })
    socketRef.current = newSocket

    const onConnect = () => {
      console.info("[ChatPage] socket connected", newSocket.id)
    }
    newSocket.on("connect", onConnect)

    const onDisconnect = (reason: string) => {
      console.info("[ChatPage] socket disconnected", reason)
    }
    newSocket.on("disconnect", onDisconnect)

    const onMyRooms = (data: { rooms: RoomSocketItem[] }) => {
      console.info("[ChatPage] myRooms", data)

      const socketRooms = data.rooms ?? []
      setRooms((prev) => {
        if (!socketRooms.length) return fallbackRoomsRef.current

        const previousById = new Map(prev.map((room) => [room.id, room]))
        const globalRoom: ChatListItem = {
          id: GLOBAL_ROOM_ID,
          title: "Общий чат для всех",
          avatarInitials: getInitials("Общий чат для всех"),
          href: `/chat/${GLOBAL_ROOM_ID}`,
          preview: previousById.get(GLOBAL_ROOM_ID)?.preview ?? "",
          timeLabel: previousById.get(GLOBAL_ROOM_ID)?.timeLabel ?? "",
          unread: previousById.get(GLOBAL_ROOM_ID)?.unread ?? 0,
        }

        const uniqueRooms = socketRooms.filter((room) => room.id !== GLOBAL_ROOM_ID)

        const socketMappedRooms: ChatListItem[] = [
          globalRoom,
          ...uniqueRooms.map((room) => {
            const previous = previousById.get(room.id)

            return {
              id: room.id,
              title: getReadableRoomTitle(room.id, room.title),
              avatarInitials: getInitials(getReadableRoomTitle(room.id, room.title)),
              href: `/chat/${room.id}`,
              preview: previous?.preview ?? "",
              timeLabel: previous?.timeLabel ?? "",
              unread: previous?.unread ?? 0,
            }
          }),
        ]

        const merged = [...fallbackRoomsRef.current]
        socketMappedRooms.forEach((room) => {
          if (!merged.some((item) => item.id === room.id)) {
            merged.push(room)
          }
        })

        return merged
      })
    }
    newSocket.on("myRooms", onMyRooms)

    const onConnectError = () => {
      console.error("[ChatPage] socket connect_error")
      setRooms(fallbackRoomsRef.current)
    }
    newSocket.on("connect_error", onConnectError)

    const onNewMessage = (msg: NewMessageSocketEvent) => {
      console.info("[ChatPage] newMessage in room", msg.roomId)
      setRooms((prev) =>
        prev.map((room) => {
          if (room.id !== msg.roomId) return room

          const isActiveRoom = activeRoomIdRef.current === msg.roomId
          const currentUnread = typeof room.unread === "number" ? room.unread : 0

          return {
            ...room,
            preview: msg.content,
            timeLabel: new Date(msg.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            unread: isActiveRoom ? 0 : currentUnread + 1,
          }
        }),
      )
    }
    newSocket.on("newMessage", onNewMessage)

    const onUserInvitedToRoom = () => {
      console.info("[ChatPage] userInvitedToRoom -> refresh myRooms")
      newSocket.emit("getMyRooms")
    }
    newSocket.on("userInvitedToRoom", onUserInvitedToRoom)

    const onRoomCreated = () => {
      console.info("[ChatPage] roomCreated -> refresh myRooms")
      newSocket.emit("getMyRooms")
    }
    newSocket.on("roomCreated", onRoomCreated)

    const onDirectRoomOpened = (payload: { roomId: string }) => {
      console.info("[ChatPage] directRoomOpened", payload)
      newSocket.emit("getMyRooms")
      if (payload?.roomId) {
        router.push(`/chat/${payload.roomId}`)
      }
    }
    newSocket.on("directRoomOpened", onDirectRoomOpened)

    console.info("[ChatPage] emit getMyRooms")
    newSocket.emit("getMyRooms")

    return () => {
      newSocket.off("myRooms", onMyRooms)
      newSocket.off("connect", onConnect)
      newSocket.off("disconnect", onDisconnect)
      newSocket.off("connect_error", onConnectError)
      newSocket.off("newMessage", onNewMessage)
      newSocket.off("userInvitedToRoom", onUserInvitedToRoom)
      newSocket.off("roomCreated", onRoomCreated)
      newSocket.off("directRoomOpened", onDirectRoomOpened)
      newSocket.disconnect()
      socketRef.current = null
    }
  }, [loading, router])

  const handleCreateChat = () => {
    if (!user) return

    const usernameInput = window.prompt("Введите username пользователя")?.trim()
    if (!usernameInput) return

    const targetUser = users.find((candidate) => candidate.username.toLowerCase() === usernameInput.toLowerCase())
    if (!targetUser) {
      window.alert("Пользователь не найден")
      return
    }

    if (targetUser.id === user.id) {
      window.alert("Нельзя создать чат с собой")
      return
    }

    const socket = socketRef.current
    if (!socket || !socket.connected) {
      window.alert("Сокет не подключен. Попробуй через пару секунд")
      return
    }

    console.info("[ChatPage] emit openDirectRoom", targetUser.id)
    socket.emit("openDirectRoom", { targetUserId: targetUser.id })
  }

  const chatItems =
    rooms.length > 0
      ? rooms
      : [
          {
            id: GLOBAL_ROOM_ID,
            title: "Общий чат для всех",
            avatarInitials: getInitials("Общий чат для всех"),
            href: `/chat/${GLOBAL_ROOM_ID}`,
            preview: "",
            timeLabel: "",
            unread: 1,
          },
        ]

  return <ChatList items={chatItems} onCreateChat={handleCreateChat} />
}
