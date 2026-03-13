"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ChatList, { type ChatCreateCandidate, type ChatListItem } from "@/components/ChatList/ChatList"
import { getInitials } from "@/lib/utils"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { getAuthToken } from "@/lib/auth"
import { usePresenceSocket } from "@/components/PresenceSocket/PresenceSocket"
import {
  normalizeNotificationBody,
  requestNotificationPermissionIfNeeded,
  showChatNotification,
} from "@/lib/notifications"

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

type ChatListRuntimeCache = {
  userId?: string
  rooms: ChatListItem[]
  onlineUserIds: string[]
  roomIdToDirectUserId: Array<[string, string]>
  directUserIdToRoomId: Array<[string, string]>
}

let chatListRuntimeCache: ChatListRuntimeCache | null = null

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

type OnlineUsersSocketPayload = {
  userIds?: string[]
  count?: number
}

type UserPresenceChangedSocketPayload = {
  userId: string
  isOnline: boolean
}

function areSetsEqual(leftSet: Set<string>, rightSet: Set<string>) {
  if (leftSet.size !== rightSet.size) return false
  for (const value of leftSet) {
    if (!rightSet.has(value)) {
      return false
    }
  }
  return true
}

function getUserIdFromJwt(token: string) {
  try {
    const [, payloadPart] = token.split(".")
    if (!payloadPart) return undefined

    const normalizedPayload = payloadPart.replace(/-/g, "+").replace(/_/g, "/")
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, "=")

    const parsedPayload = JSON.parse(window.atob(paddedPayload)) as { sub?: unknown }
    return typeof parsedPayload?.sub === "string" ? parsedPayload.sub : undefined
  } catch {
    return undefined
  }
}

export default function ChatPage() {
  const { user, users } = useAuth()
  const { socket } = usePresenceSocket()
  const [rooms, setRooms] = useState<ChatListItem[]>([BASE_GLOBAL_CHAT_ITEM])
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const roomsRef = useRef<ChatListItem[]>([BASE_GLOBAL_CHAT_ITEM])
  const usersRef = useRef(users)
  const onlineUserIdsRef = useRef<Set<string>>(new Set())
  const currentUserIdRef = useRef<string | undefined>(undefined)
  const activeRoomIdRef = useRef<string | null>(null)
  const roomIdToDirectUserIdRef = useRef<Map<string, string>>(new Map())
  const directUserIdToRoomIdRef = useRef<Map<string, string>>(new Map())
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  const router = useRouter()

  const activeRoomIdPath = pathname?.startsWith("/chat/") ? pathname.replace("/chat/", "") : null
  const activeRoomId = activeRoomIdPath === GLOBAL_ROOM_SLUG ? GLOBAL_ROOM_ID : activeRoomIdPath

  const applyOnlinePresenceToRooms = useCallback((nextOnlineIds: Set<string>) => {
    setRooms((prev) => {
      let hasUpdates = false

      const nextRooms = prev.map((room) => {
        if (room.id === GLOBAL_ROOM_ID) {
          return room
        }

        const isOnline = nextOnlineIds.has(room.id)
        if (room.isOnline === isOnline) {
          return room
        }

        hasUpdates = true
        return {
          ...room,
          isOnline,
        }
      })

      return hasUpdates ? nextRooms : prev
    })
  }, [])

  const syncOnlinePresence = useCallback((nextOnlineIds: Set<string>) => {
    onlineUserIdsRef.current = nextOnlineIds
    setOnlineUserIds((prev) => (areSetsEqual(prev, nextOnlineIds) ? prev : nextOnlineIds))
    applyOnlinePresenceToRooms(nextOnlineIds)
  }, [applyOnlinePresenceToRooms])

  const usersById = useMemo(() => {
    return new Map(users.map((existingUser) => [existingUser.id, existingUser]))
  }, [users])

  const chatCreateCandidates = useMemo<ChatCreateCandidate[]>(() => {
    const directChatUserIds = new Set(rooms.filter((room) => room.id !== GLOBAL_ROOM_ID).map((room) => room.id))

    return users
      .filter((existingUser) => existingUser.id !== user?.id)
      .map((existingUser) => ({
        id: existingUser.id,
        username: existingUser.username,
        email: existingUser.email,
        isOnline: onlineUserIds.has(existingUser.id),
        hasDirectChat: directChatUserIds.has(existingUser.id),
      }))
      .sort((leftUser, rightUser) => {
        if (leftUser.hasDirectChat !== rightUser.hasDirectChat) {
          return leftUser.hasDirectChat ? 1 : -1
        }

        if (leftUser.isOnline !== rightUser.isOnline) {
          return leftUser.isOnline ? -1 : 1
        }

        return leftUser.username.localeCompare(rightUser.username, "ru", { sensitivity: "base" })
      })
  }, [onlineUserIds, rooms, user?.id, users])

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId
  }, [activeRoomId])

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    roomsRef.current = rooms
  }, [rooms])

  useEffect(() => {
    if (!chatListRuntimeCache) {
      return
    }

    const token = getAuthToken()
    const tokenUserId = token ? getUserIdFromJwt(token) : undefined
    if (tokenUserId && chatListRuntimeCache.userId && tokenUserId !== chatListRuntimeCache.userId) {
      return
    }

    currentUserIdRef.current = chatListRuntimeCache.userId ?? currentUserIdRef.current

    const cachedOnlineIds = new Set(chatListRuntimeCache.onlineUserIds)
    onlineUserIdsRef.current = cachedOnlineIds
    setOnlineUserIds(cachedOnlineIds)

    roomIdToDirectUserIdRef.current = new Map(chatListRuntimeCache.roomIdToDirectUserId)
    directUserIdToRoomIdRef.current = new Map(chatListRuntimeCache.directUserIdToRoomId)

    setRooms(chatListRuntimeCache.rooms.length ? chatListRuntimeCache.rooms : [BASE_GLOBAL_CHAT_ITEM])
  }, [])

  useEffect(() => {
    chatListRuntimeCache = {
      userId: currentUserIdRef.current,
      rooms,
      onlineUserIds: Array.from(onlineUserIds),
      roomIdToDirectUserId: Array.from(roomIdToDirectUserIdRef.current.entries()),
      directUserIdToRoomId: Array.from(directUserIdToRoomIdRef.current.entries()),
    }
  }, [onlineUserIds, rooms])

  useEffect(() => {
    currentUserIdRef.current = user?.id
  }, [user?.id])

  useEffect(() => {
    usersRef.current = users

    if (!users.length) {
      return
    }

    const usersMap = new Map(users.map((existingUser) => [existingUser.id, existingUser]))

    setRooms((prev) => {
      let hasUpdates = false

      const nextRooms = prev.map((room) => {
        if (room.id === GLOBAL_ROOM_ID) {
          return room
        }

        const matchedUser = usersMap.get(room.id)
        if (!matchedUser || matchedUser.username === room.title) {
          return room
        }

        hasUpdates = true
        return {
          ...room,
          title: matchedUser.username,
          avatarInitials: getInitials(matchedUser.username),
        }
      })

      return hasUpdates ? nextRooms : prev
    })
  }, [users])

  useEffect(() => {
    if (!socket) {
      syncOnlinePresence(new Set())
      return
    }

    const token = getAuthToken()
    if (!token) return

    if (!currentUserIdRef.current) {
      currentUserIdRef.current = getUserIdFromJwt(token)
    }

    void requestNotificationPermissionIfNeeded()

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

        const resolvedCurrentUserId = currentUserIdRef.current

        socketRooms
          .filter((room) => room.id !== GLOBAL_ROOM_ID)
          .forEach((room) => {
            const targetUserId = getDirectTargetUserId(room.title, resolvedCurrentUserId)
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
                isOnline: onlineUserIdsRef.current.has(targetUserId),
              })
            }
          })

        roomIdToDirectUserIdRef.current = nextRoomToUser
        directUserIdToRoomIdRef.current = nextUserToRoom

        return [globalRoom, ...Array.from(directChatsByUserId.values())]
      })
    }
    socket.on("myRooms", onMyRooms)

    const onDisconnect = () => {
      syncOnlinePresence(new Set())
    }
    socket.on("disconnect", onDisconnect)

    const onConnectError = () => {
      syncOnlinePresence(new Set())
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
    socket.on("connect_error", onConnectError)

    const onOnlineUsers = (payload: OnlineUsersSocketPayload) => {
      const nextUserIds = Array.isArray(payload?.userIds) ? payload.userIds : []
      syncOnlinePresence(new Set(nextUserIds))
    }
    socket.on("onlineUsers", onOnlineUsers)

    const onUserPresenceChanged = (payload: UserPresenceChangedSocketPayload) => {
      if (!payload?.userId) return

      const nextOnlineIds = new Set(onlineUserIdsRef.current)
      if (payload.isOnline) {
        nextOnlineIds.add(payload.userId)
      } else {
        nextOnlineIds.delete(payload.userId)
      }

      if (areSetsEqual(onlineUserIdsRef.current, nextOnlineIds)) {
        return
      }

      syncOnlinePresence(nextOnlineIds)
    }
    socket.on("userPresenceChanged", onUserPresenceChanged)

    const onNewMessage = (msg: NewMessageSocketEvent) => {
      const directUserId = roomIdToDirectUserIdRef.current.get(msg.roomId)
      const mappedId = msg.roomId === GLOBAL_ROOM_ID ? GLOBAL_ROOM_ID : directUserId
      const normalizedContent = normalizeNotificationBody(msg.content) || msg.content

      if (!mappedId) return

      const directRoomId = directUserId ? directUserIdToRoomIdRef.current.get(directUserId) : undefined
      const isActiveRoom =
        activeRoomIdRef.current === mappedId || (Boolean(directRoomId) && activeRoomIdRef.current === directRoomId)

      const currentPath = pathnameRef.current ?? ""
      const isChatRoute = currentPath === "/chat" || currentPath.startsWith("/chat/")
      const shouldShowNotification = !isActiveRoom && (document.visibilityState !== "visible" || !isChatRoute)

      if (shouldShowNotification) {
        const mappedRoom = roomsRef.current.find((room) => room.id === mappedId)
        const notificationTitle =
          mappedId === GLOBAL_ROOM_ID
            ? "Новое сообщение в общем чате"
            : `Новое сообщение от ${mappedRoom?.title ?? "собеседника"}`

        const targetUrl = mappedId === GLOBAL_ROOM_ID ? `/chat/${GLOBAL_ROOM_SLUG}` : `/chat/${mappedId}`
        void showChatNotification({
          title: notificationTitle,
          body: normalizedContent,
          targetUrl,
          tag: `room-${mappedId}`,
        })
      }

      setRooms((prev) =>
        prev.map((room) => {
          if (room.id !== mappedId) return room
          const currentUnread = typeof room.unread === "number" ? room.unread : 0

          return {
            ...room,
            preview: normalizedContent,
            timeLabel: new Date(msg.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
            unread: isActiveRoom ? 0 : currentUnread + 1,
          }
        }),
      )
    }
    socket.on("newMessage", onNewMessage)

    const onUserInvitedToRoom = () => {
      socket.emit("getMyRooms")
    }
    socket.on("userInvitedToRoom", onUserInvitedToRoom)

    const onRoomCreated = () => {
      socket.emit("getMyRooms")
    }
    socket.on("roomCreated", onRoomCreated)

    const onDirectRoomOpened = (payload: DirectRoomOpenedSocketEvent) => {
      if (payload?.roomId && payload?.targetUserId) {
        roomIdToDirectUserIdRef.current.set(payload.roomId, payload.targetUserId)
        directUserIdToRoomIdRef.current.set(payload.targetUserId, payload.roomId)
      }

      const targetUserId = payload?.targetUserId
      if (targetUserId) {
        const targetUser = usersRef.current.find((existingUser) => existingUser.id === targetUserId)
        const directTitle = targetUser?.username ?? "Личный чат"

        setRooms((prev) => {
          if (prev.some((room) => room.id === targetUserId)) {
            return prev
          }

          const globalRoom = prev.find((room) => room.id === GLOBAL_ROOM_ID) ?? BASE_GLOBAL_CHAT_ITEM
          const directRooms = prev.filter((room) => room.id !== GLOBAL_ROOM_ID)

          return [
            globalRoom,
            {
              id: targetUserId,
              title: directTitle,
              avatarInitials: getInitials(directTitle),
              href: `/chat/${targetUserId}`,
              preview: "",
              timeLabel: "",
              unread: 0,
              isOnline: onlineUserIdsRef.current.has(targetUserId),
            },
            ...directRooms,
          ]
        })
      }

      if (payload?.targetUserId) {
        router.push(`/chat/${payload.targetUserId}`)
        return
      }

      if (payload?.roomId) {
        const nextRouteRoomId = payload.roomId === GLOBAL_ROOM_ID ? GLOBAL_ROOM_SLUG : payload.roomId
        router.push(`/chat/${nextRouteRoomId}`)
      }
    }
    socket.on("directRoomOpened", onDirectRoomOpened)

    if (!chatListRuntimeCache?.rooms.length || chatListRuntimeCache.rooms.length <= 1) {
      socket.emit("getMyRooms")
    }

    return () => {
      socket.off("myRooms", onMyRooms)
      socket.off("disconnect", onDisconnect)
      socket.off("connect_error", onConnectError)
      socket.off("onlineUsers", onOnlineUsers)
      socket.off("userPresenceChanged", onUserPresenceChanged)
      socket.off("newMessage", onNewMessage)
      socket.off("userInvitedToRoom", onUserInvitedToRoom)
      socket.off("roomCreated", onRoomCreated)
      socket.off("directRoomOpened", onDirectRoomOpened)
    }
  }, [router, socket, syncOnlinePresence, user?.id])

  const handleCreateChat = useCallback((targetUserId: string) => {
    if (!user) return

    const targetUser = usersById.get(targetUserId)
    if (!targetUser) {
      window.alert("Пользователь не найден")
      return
    }

    if (targetUser.id === user.id) {
      window.alert("Нельзя создать чат с собой")
      return
    }

    const existingDirectRoomId = directUserIdToRoomIdRef.current.get(targetUser.id)
    if (existingDirectRoomId) {
      router.push(`/chat/${targetUser.id}`)
      return
    }

    if (!socket || !socket.connected) {
      window.alert("Сокет не подключен. Попробуй через пару секунд")
      return
    }

    setRooms((prev) => {
      if (prev.some((room) => room.id === targetUser.id)) {
        return prev
      }

      const globalRoom = prev.find((room) => room.id === GLOBAL_ROOM_ID) ?? BASE_GLOBAL_CHAT_ITEM
      const directRooms = prev.filter((room) => room.id !== GLOBAL_ROOM_ID)

      return [
        globalRoom,
        {
          id: targetUser.id,
          title: targetUser.username,
          avatarInitials: getInitials(targetUser.username),
          href: `/chat/${targetUser.id}`,
          preview: "",
          timeLabel: "",
          unread: 0,
          isOnline: onlineUserIdsRef.current.has(targetUser.id),
        },
        ...directRooms,
      ]
    })

    socket.emit("openDirectRoom", { targetUserId: targetUser.id })
  }, [router, user, usersById])

  const chatItems =
    rooms.length > 0
      ? rooms
      : [
          createGlobalChatItem({
            preview: "Нет подключений к чату",
          }),
        ]

  return <ChatList items={chatItems} onCreateChat={handleCreateChat} chatCandidates={chatCreateCandidates} />
}
