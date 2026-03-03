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
const GLOBAL_ROOM_SLUG = "global"
const GLOBAL_CHAT_TITLE = "Общий чат для всех"

function createGlobalChatItem(overrides?: Partial<ChatListItem>): ChatListItem {
  return {
    id: GLOBAL_ROOM_ID,
    title: GLOBAL_CHAT_TITLE,
    avatarInitials: getInitials(GLOBAL_CHAT_TITLE),
    href: `/chat/${GLOBAL_ROOM_SLUG}`,
    preview: "",
    timeLabel: "",
    unread: 0,
    ...overrides,
  }
}

const BASE_GLOBAL_CHAT_ITEM: ChatListItem = createGlobalChatItem()

function getDirectTargetUserId(title: string, currentUserId?: string) {
  if (!title?.startsWith("dm:")) return undefined

  const ids = title.split(":").slice(1)
  return ids.find((id) => id !== currentUserId)
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

type DirectRoomOpenedSocketEvent = {
  roomId: string
  targetUserId?: string
}

export default function ChatPage() {
  const { user, users, loading } = useAuth()
  const [rooms, setRooms] = useState<ChatListItem[]>([BASE_GLOBAL_CHAT_ITEM])
  const socketRef = useRef<ReturnType<typeof io> | null>(null)
  const usersRef = useRef(users)
  const activeRoomIdRef = useRef<string | null>(null)
  const roomIdToDirectUserIdRef = useRef<Map<string, string>>(new Map())
  const directUserIdToRoomIdRef = useRef<Map<string, string>>(new Map())
  const pathname = usePathname()
  const router = useRouter()

  const activeRoomIdPath = pathname?.startsWith("/chat/") ? pathname.replace("/chat/", "") : null
  const activeRoomId = activeRoomIdPath === GLOBAL_ROOM_SLUG ? GLOBAL_ROOM_ID : activeRoomIdPath

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId
  }, [activeRoomId])

  useEffect(() => {
    usersRef.current = users

    if (socketRef.current?.connected) {
      socketRef.current.emit("getMyRooms")
    }
  }, [users])

  useEffect(() => {
    if (loading) return

    if (socketRef.current) {
      return
    }

    const token = getAuthToken()
    if (!token) return

    const newSocket = io(WS_URL, {
      auth: { token },
      transports: ["websocket"],
    })
    socketRef.current = newSocket

    const onMyRooms = (data: { rooms: RoomSocketItem[] }) => {
      const socketRooms = data.rooms ?? []
      setRooms((prev) => {
        if (!socketRooms.length) return [BASE_GLOBAL_CHAT_ITEM]

        const previousById = new Map(prev.map((room) => [room.id, room]))
        const usersById = new Map(usersRef.current.map((existingUser) => [existingUser.id, existingUser]))
        const globalRoom = createGlobalChatItem({
          preview: previousById.get(GLOBAL_ROOM_ID)?.preview ?? "",
          timeLabel: previousById.get(GLOBAL_ROOM_ID)?.timeLabel ?? "",
          unread: previousById.get(GLOBAL_ROOM_ID)?.unread ?? 0,
        })

        const nextRoomToUser = new Map<string, string>()
        const nextUserToRoom = new Map<string, string>()

        const directChatsByUserId = new Map<string, ChatListItem>()

        socketRooms
          .filter((room) => room.id !== GLOBAL_ROOM_ID)
          .forEach((room) => {
            const targetUserId = getDirectTargetUserId(room.title, user?.id)
            if (!targetUserId) return

            const targetUser = usersById.get(targetUserId)
            const previous = previousById.get(targetUserId)
            const directTitle = targetUser?.username ?? "Личный чат"

            nextRoomToUser.set(room.id, targetUserId)
            nextUserToRoom.set(targetUserId, room.id)

            if (!directChatsByUserId.has(targetUserId)) {
              directChatsByUserId.set(targetUserId, {
                id: targetUserId,
                title: directTitle,
                avatarInitials: getInitials(directTitle),
                href: `/chat/${targetUserId}`,
                preview: previous?.preview ?? "",
                timeLabel: previous?.timeLabel ?? "",
                unread: previous?.unread ?? 0,
              })
            }
          })

        roomIdToDirectUserIdRef.current = nextRoomToUser
        directUserIdToRoomIdRef.current = nextUserToRoom

        return [globalRoom, ...Array.from(directChatsByUserId.values())]
      })
    }
    newSocket.on("myRooms", onMyRooms)

    const onConnectError = () => {
      setRooms((prev) => {
        const prevGlobal = prev.find((room) => room.id === GLOBAL_ROOM_ID)

        return [
          createGlobalChatItem({
            preview: prevGlobal?.preview ?? BASE_GLOBAL_CHAT_ITEM.preview,
            timeLabel: prevGlobal?.timeLabel ?? BASE_GLOBAL_CHAT_ITEM.timeLabel,
            unread: prevGlobal?.unread ?? BASE_GLOBAL_CHAT_ITEM.unread,
          }),
        ]
      })
    }
    newSocket.on("connect_error", onConnectError)

    const onNewMessage = (msg: NewMessageSocketEvent) => {
      const directUserId = roomIdToDirectUserIdRef.current.get(msg.roomId)
      const mappedId = msg.roomId === GLOBAL_ROOM_ID ? GLOBAL_ROOM_ID : directUserId

      if (!mappedId) return

      setRooms((prev) =>
        prev.map((room) => {
          if (room.id !== mappedId) return room

          const directRoomId = directUserId ? directUserIdToRoomIdRef.current.get(directUserId) : undefined
          const isActiveRoom =
            activeRoomIdRef.current === room.id || (Boolean(directRoomId) && activeRoomIdRef.current === directRoomId)
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
      newSocket.emit("getMyRooms")
    }
    newSocket.on("userInvitedToRoom", onUserInvitedToRoom)

    const onRoomCreated = () => {
      newSocket.emit("getMyRooms")
    }
    newSocket.on("roomCreated", onRoomCreated)

    const onDirectRoomOpened = (payload: DirectRoomOpenedSocketEvent) => {
      newSocket.emit("getMyRooms")

      if (payload?.targetUserId) {
        router.push(`/chat/${payload.targetUserId}`)
        return
      }

      if (payload?.roomId) {
        const nextRouteRoomId = payload.roomId === GLOBAL_ROOM_ID ? GLOBAL_ROOM_SLUG : payload.roomId
        router.push(`/chat/${nextRouteRoomId}`)
      }
    }
    newSocket.on("directRoomOpened", onDirectRoomOpened)

    newSocket.emit("getMyRooms")

    return () => {
      newSocket.off("myRooms", onMyRooms)
      newSocket.off("connect_error", onConnectError)
      newSocket.off("newMessage", onNewMessage)
      newSocket.off("userInvitedToRoom", onUserInvitedToRoom)
      newSocket.off("roomCreated", onRoomCreated)
      newSocket.off("directRoomOpened", onDirectRoomOpened)
      newSocket.disconnect()
      socketRef.current = null
    }
  }, [loading, router, user?.id])

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

    socket.emit("openDirectRoom", { targetUserId: targetUser.id })
  }

  const chatItems =
    rooms.length > 0
      ? rooms
      : [
          createGlobalChatItem({
            preview: "Нет подключений к чату",
          }),
        ]

  return <ChatList items={chatItems} onCreateChat={handleCreateChat} />
}
