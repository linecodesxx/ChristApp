"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ChatList, { type ChatCreateCandidate, type ChatListItem } from "@/components/ChatList/ChatList"
import { getInitials } from "@/lib/utils"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { getAuthToken } from "@/lib/auth"
import { fetchUnreadSummary, type UnreadSummaryResponse, type UnreadSummaryRoomLastMessage } from "@/lib/push"
import { usePresenceSocket } from "@/components/PresenceSocket/PresenceSocket"
import { normalizeNotificationBody, showChatNotification } from "@/lib/notifications"

const GLOBAL_ROOM_ID = "00000000-0000-0000-0000-000000000001"
const GLOBAL_ROOM_SLUG = "global"
const GLOBAL_CHAT_TITLE = "Общий чат для всех"
const SHARE_WITH_JESUS_ROOM_PREFIX = "share-with-jesus:"
const SHARE_WITH_JESUS_CHAT_ID = "__share_with_jesus__"
const SHARE_WITH_JESUS_CHAT_TITLE = "Поделись с Иисусом"

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

function isShareWithJesusRoomTitle(title: string) {
  return title.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)
}

function createShareWithJesusChatItem(roomId: string, previous?: ChatListItem): ChatListItem {
  return {
    id: SHARE_WITH_JESUS_CHAT_ID,
    title: SHARE_WITH_JESUS_CHAT_TITLE,
    avatarImage: "/jesusAvatar.svg",
    avatarClass: "jesusAvatar",
    href: `/chat/${roomId}`,
    preview: previous?.preview ?? "",
    timeLabel: previous?.timeLabel ?? "",
  }
}

function getShareWithJesusRoomFromPrevious(rooms: ChatListItem[]) {
  return rooms.find((room) => room.id === SHARE_WITH_JESUS_CHAT_ID)
}

type DirectRoomItemInput = {
  userId: string
  title: string
  isOnline: boolean
  previous?: ChatListItem
}

function getGlobalRoomFromPrevious(rooms: ChatListItem[]) {
  const previousGlobal = rooms.find((room) => room.id === GLOBAL_ROOM_ID)

  return createGlobalChatItem({
    preview: previousGlobal?.preview ?? "",
    timeLabel: previousGlobal?.timeLabel ?? "",
    unread: previousGlobal?.unread ?? 0,
  })
}

function createDirectRoomItem({ userId, title, isOnline, previous }: DirectRoomItemInput): ChatListItem {
  return {
    id: userId,
    title,
    avatarInitials: getInitials(title),
    href: `/chat/${userId}`,
    preview: previous?.preview ?? "",
    timeLabel: previous?.timeLabel ?? "",
    unread: previous?.unread ?? 0,
    isOnline,
  }
}

function prependDirectRoomIfMissing(rooms: ChatListItem[], input: DirectRoomItemInput) {
  if (rooms.some((room) => room.id === input.userId)) {
    return rooms
  }

  const globalRoom = getGlobalRoomFromPrevious(rooms)
  const shareWithJesusRoom = getShareWithJesusRoomFromPrevious(rooms)
  const directRooms = rooms.filter((room) => room.id !== GLOBAL_ROOM_ID && room.id !== SHARE_WITH_JESUS_CHAT_ID)

  return shareWithJesusRoom
    ? [globalRoom, shareWithJesusRoom, createDirectRoomItem(input), ...directRooms]
    : [globalRoom, createDirectRoomItem(input), ...directRooms]
}

function prependShareWithJesusRoomIfMissing(rooms: ChatListItem[], roomId?: string) {
  if (!roomId || rooms.some((room) => room.id === SHARE_WITH_JESUS_CHAT_ID)) {
    return rooms
  }

  const globalRoom = getGlobalRoomFromPrevious(rooms)
  const directRooms = rooms.filter((room) => room.id !== GLOBAL_ROOM_ID && room.id !== SHARE_WITH_JESUS_CHAT_ID)

  return [globalRoom, createShareWithJesusChatItem(roomId), ...directRooms]
}

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
  username?: string
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

function isChatPath(path: string) {
  return path === "/chat" || path.startsWith("/chat/")
}

function shouldShowListNotification(isActiveRoom: boolean, currentPath: string) {
  return !isActiveRoom && (document.visibilityState !== "visible" || !isChatPath(currentPath))
}

function formatChatTimeLabel(createdAt: string) {
  const parsedDate = new Date(createdAt)
  if (Number.isNaN(parsedDate.getTime())) {
    return ""
  }

  return parsedDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatRoomPreviewFromLastMessage(
  roomId: string,
  lastMessage: UnreadSummaryRoomLastMessage,
  currentUsername?: string,
) {
  const normalizedContent = normalizeNotificationBody(lastMessage.content) || lastMessage.content
  if (!normalizedContent.trim()) {
    return ""
  }

  if (roomId === GLOBAL_ROOM_ID) {
    return `${lastMessage.senderUsername}: ${normalizedContent}`
  }

  if (lastMessage.senderUsername === currentUsername) {
    return `Вы: ${normalizedContent}`
  }

  return normalizedContent
}

export default function ChatPage() {
  const { user, users } = useAuth()
  const { socket } = usePresenceSocket()
  const [rooms, setRooms] = useState<ChatListItem[]>([BASE_GLOBAL_CHAT_ITEM])
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  // Эти refs нужны socket listeners, чтобы всегда читать актуальное состояние между рендерами.
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

  const syncOnlinePresence = useCallback(
    (nextOnlineIds: Set<string>) => {
      onlineUserIdsRef.current = nextOnlineIds
      setOnlineUserIds((prev) => (areSetsEqual(prev, nextOnlineIds) ? prev : nextOnlineIds))
      applyOnlinePresenceToRooms(nextOnlineIds)
    },
    [applyOnlinePresenceToRooms],
  )

  const applyUnreadSummary = useCallback(
    (summary: UnreadSummaryResponse) => {
      const summaryByRoomId = new Map(summary.rooms.map((roomSummary) => [roomSummary.roomId, roomSummary]))

      setRooms((prev) => {
        let hasUpdates = false

        const nextRooms = prev.map((room) => {
          const sourceRoomId =
            room.id === GLOBAL_ROOM_ID ? GLOBAL_ROOM_ID : directUserIdToRoomIdRef.current.get(room.id)

          if (!sourceRoomId) {
            return room
          }

          const summaryRoom = summaryByRoomId.get(sourceRoomId)
          const nextUnread = summaryRoom ? Math.max(0, Number(summaryRoom.unread) || 0) : 0
          const nextPreview = summaryRoom?.lastMessage
            ? formatRoomPreviewFromLastMessage(sourceRoomId, summaryRoom.lastMessage, user?.username)
            : (room.preview ?? "")
          const nextTimeLabel = summaryRoom?.lastMessage
            ? formatChatTimeLabel(summaryRoom.lastMessage.createdAt)
            : (room.timeLabel ?? "")
          const currentUnread = typeof room.unread === "number" ? room.unread : room.unread ? 1 : 0

          if (
            currentUnread === nextUnread &&
            (room.preview ?? "") === nextPreview &&
            (room.timeLabel ?? "") === nextTimeLabel
          ) {
            return room
          }

          hasUpdates = true
          return {
            ...room,
            unread: nextUnread,
            preview: nextPreview,
            timeLabel: nextTimeLabel,
          }
        })

        const globalRoom = nextRooms.find((room) => room.id === GLOBAL_ROOM_ID)
        const shareWithJesusRoom = nextRooms.find((room) => room.id === SHARE_WITH_JESUS_CHAT_ID)
        const directRooms = nextRooms.filter(
          (room) => room.id !== GLOBAL_ROOM_ID && room.id !== SHARE_WITH_JESUS_CHAT_ID,
        )
        const sortedDirectRooms = [...directRooms].sort((leftRoom, rightRoom) => {
          const leftSourceRoomId = directUserIdToRoomIdRef.current.get(leftRoom.id)
          const rightSourceRoomId = directUserIdToRoomIdRef.current.get(rightRoom.id)

          const leftCreatedAt = leftSourceRoomId
            ? summaryByRoomId.get(leftSourceRoomId)?.lastMessage?.createdAt
            : undefined
          const rightCreatedAt = rightSourceRoomId
            ? summaryByRoomId.get(rightSourceRoomId)?.lastMessage?.createdAt
            : undefined

          const leftTs = leftCreatedAt ? new Date(leftCreatedAt).getTime() : 0
          const rightTs = rightCreatedAt ? new Date(rightCreatedAt).getTime() : 0

          if (leftTs !== rightTs) {
            return rightTs - leftTs
          }

          const leftUnread = typeof leftRoom.unread === "number" ? leftRoom.unread : leftRoom.unread ? 1 : 0
          const rightUnread = typeof rightRoom.unread === "number" ? rightRoom.unread : rightRoom.unread ? 1 : 0

          if (leftUnread !== rightUnread) {
            return rightUnread - leftUnread
          }

          return leftRoom.title.localeCompare(rightRoom.title, "ru", { sensitivity: "base" })
        })

        // Ставим "Поделись с Иисусом" первым, затем общий чат, затем остальные
        const orderedRooms = shareWithJesusRoom
          ? [shareWithJesusRoom, ...(globalRoom ? [globalRoom] : []), ...sortedDirectRooms]
          : [...(globalRoom ? [globalRoom] : []), ...sortedDirectRooms]
        const hasOrderChanges = orderedRooms.some((room, index) => room.id !== prev[index]?.id)

        return hasUpdates || hasOrderChanges ? orderedRooms : prev
      })
    },
    [user?.username],
  )

  const refreshUnreadSummary = useCallback(async () => {
    const token = getAuthToken()
    if (!token) {
      return
    }

    const unreadSummary = await fetchUnreadSummary(token)
    if (!unreadSummary) {
      return
    }

    applyUnreadSummary(unreadSummary)
  }, [applyUnreadSummary])

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
    if (!user?.id) {
      return
    }

    void refreshUnreadSummary()
  }, [refreshUnreadSummary, user?.id])

  useEffect(() => {
    const onFocus = () => {
      void refreshUnreadSummary()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshUnreadSummary()
      }
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [refreshUnreadSummary])

  useEffect(() => {
    usersRef.current = users

    if (!users.length) {
      return
    }

    const usersMap = new Map(users.map((existingUser) => [existingUser.id, existingUser]))

    setRooms((prev) => {
      let hasUpdates = false

      const nextRooms = prev.map((room) => {
        if (room.id === GLOBAL_ROOM_ID || room.id === SHARE_WITH_JESUS_CHAT_ID) {
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

    const syncRoomsFromServer = () => {
      socket.emit("getMyRooms")
      void refreshUnreadSummary()
    }

    const onConnect = () => {
      syncRoomsFromServer()
    }
    socket.on("connect", onConnect)

    if (socket.connected) {
      syncRoomsFromServer()
    }

    const onMyRooms = (data: { rooms: RoomSocketItem[] }) => {
      const socketRooms = data.rooms ?? []
      const previousRooms = roomsRef.current

      if (!socketRooms.length) {
        roomIdToDirectUserIdRef.current = new Map()
        directUserIdToRoomIdRef.current = new Map()
        setRooms([BASE_GLOBAL_CHAT_ITEM])
        void refreshUnreadSummary()
        return
      }

      const previousById = new Map(previousRooms.map((room) => [room.id, room]))
      const usersById = new Map(usersRef.current.map((existingUser) => [existingUser.id, existingUser]))
      const globalRoom = getGlobalRoomFromPrevious(previousRooms)
      const previousShareWithJesusRoom = getShareWithJesusRoomFromPrevious(previousRooms)

      const nextRoomToUser = new Map<string, string>()
      const nextUserToRoom = new Map<string, string>()

      const directChatsByUserId = new Map<string, ChatListItem>()
      let shareWithJesusRoom: ChatListItem | undefined

      const resolvedCurrentUserId = currentUserIdRef.current

      socketRooms
        .filter((room) => room.id !== GLOBAL_ROOM_ID)
        .forEach((room) => {
          if (isShareWithJesusRoomTitle(room.title)) {
            nextRoomToUser.set(room.id, SHARE_WITH_JESUS_CHAT_ID)
            nextUserToRoom.set(SHARE_WITH_JESUS_CHAT_ID, room.id)
            shareWithJesusRoom = createShareWithJesusChatItem(room.id, previousShareWithJesusRoom)
            return
          }

          const targetUserId = getDirectTargetUserId(room.title, resolvedCurrentUserId)
          if (!targetUserId) return

          const targetUser = usersById.get(targetUserId)
          const previous = previousById.get(targetUserId)
          const directTitle = targetUser?.username ?? "Личный чат"

          nextRoomToUser.set(room.id, targetUserId)
          nextUserToRoom.set(targetUserId, room.id)

          if (!directChatsByUserId.has(targetUserId)) {
            directChatsByUserId.set(
              targetUserId,
              createDirectRoomItem({
                userId: targetUserId,
                title: directTitle,
                previous,
                isOnline: onlineUserIdsRef.current.has(targetUserId),
              }),
            )
          }
        })

      roomIdToDirectUserIdRef.current = nextRoomToUser
      directUserIdToRoomIdRef.current = nextUserToRoom

      setRooms([
        ...(shareWithJesusRoom ? [shareWithJesusRoom] : []),
        globalRoom,
        ...Array.from(directChatsByUserId.values()),
      ])
      void refreshUnreadSummary()
    }
    socket.on("myRooms", onMyRooms)

    const onDisconnect = () => {
      syncOnlinePresence(new Set())
    }
    socket.on("disconnect", onDisconnect)

    const onConnectError = () => {
      syncOnlinePresence(new Set())
      roomIdToDirectUserIdRef.current = new Map()
      directUserIdToRoomIdRef.current = new Map()
      setRooms((prev) => {
        const globalRoom = getGlobalRoomFromPrevious(prev)
        const shareWithJesusRoom = getShareWithJesusRoomFromPrevious(prev)

        return shareWithJesusRoom ? [globalRoom, shareWithJesusRoom] : [globalRoom]
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

      if (!mappedId) {
        socket.emit("getMyRooms")
        void refreshUnreadSummary()
        return
      }

      const isOwnMessage = Boolean(msg.username && msg.username === user?.username)

      const directRoomId = directUserId ? directUserIdToRoomIdRef.current.get(directUserId) : undefined
      const isActiveRoom =
        activeRoomIdRef.current === mappedId || (Boolean(directRoomId) && activeRoomIdRef.current === directRoomId)

      const currentPath = pathnameRef.current ?? ""
      const shouldShowNotification = !isOwnMessage && shouldShowListNotification(isActiveRoom, currentPath)

      if (shouldShowNotification) {
        const mappedRoom = roomsRef.current.find((room) => room.id === mappedId)
        const mappedRoomId = mappedId === SHARE_WITH_JESUS_CHAT_ID ? directRoomId || msg.roomId : mappedId
        const notificationTitle =
          mappedId === GLOBAL_ROOM_ID
            ? `Новое сообщение в общем чате от ${msg.username ?? "пользователя"}`
            : `Новое сообщение от ${mappedRoom?.title ?? "собеседника"}`

        const targetUrl = mappedId === GLOBAL_ROOM_ID ? `/chat/${GLOBAL_ROOM_SLUG}` : `/chat/${mappedRoomId}`
        void showChatNotification({
          title: notificationTitle,
          body: normalizedContent,
          targetUrl,
          tag: `room-${mappedId}`,
        })
      }

      const previewContent =
        mappedId === GLOBAL_ROOM_ID && msg.username ? `${msg.username}: ${normalizedContent}` : normalizedContent

      setRooms((prev) =>
        (() => {
          const hasRoomInList = prev.some((room) => room.id === mappedId)
          const baseRooms =
            !hasRoomInList && mappedId !== GLOBAL_ROOM_ID
              ? mappedId === SHARE_WITH_JESUS_CHAT_ID
                ? prependShareWithJesusRoomIfMissing(prev, directRoomId)
                : prependDirectRoomIfMissing(prev, {
                    userId: mappedId,
                    title:
                      usersRef.current.find((existingUser) => existingUser.id === mappedId)?.username ?? "Личный чат",
                    isOnline: onlineUserIdsRef.current.has(mappedId),
                  })
              : prev

          return baseRooms.map((room) => {
            if (room.id !== mappedId) return room
            const currentUnread = typeof room.unread === "number" ? room.unread : room.unread ? 1 : 0
            const nextUnread = isActiveRoom ? 0 : isOwnMessage ? currentUnread : currentUnread + 1

            return {
              ...room,
              preview: previewContent,
              timeLabel: formatChatTimeLabel(msg.createdAt),
              unread: nextUnread,
            }
          })
        })(),
      )
    }
    socket.on("newMessage", onNewMessage)

    const onMessageDeleted = () => {
      void refreshUnreadSummary()
    }
    socket.on("messageDeleted", onMessageDeleted)

    const onUserInvitedToRoom = () => {
      socket.emit("getMyRooms")
      void refreshUnreadSummary()
    }
    socket.on("userInvitedToRoom", onUserInvitedToRoom)

    const onRoomCreated = () => {
      socket.emit("getMyRooms")
      void refreshUnreadSummary()
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

        setRooms((prev) =>
          prependDirectRoomIfMissing(prev, {
            userId: targetUserId,
            title: directTitle,
            isOnline: onlineUserIdsRef.current.has(targetUserId),
          }),
        )
      }

      if (payload?.targetUserId) {
        router.push(`/chat/${payload.targetUserId}`)
        void refreshUnreadSummary()
        return
      }

      if (payload?.roomId) {
        const nextRouteRoomId = payload.roomId === GLOBAL_ROOM_ID ? GLOBAL_ROOM_SLUG : payload.roomId
        router.push(`/chat/${nextRouteRoomId}`)
        void refreshUnreadSummary()
      }
    }
    socket.on("directRoomOpened", onDirectRoomOpened)

    return () => {
      socket.off("connect", onConnect)
      socket.off("myRooms", onMyRooms)
      socket.off("disconnect", onDisconnect)
      socket.off("connect_error", onConnectError)
      socket.off("onlineUsers", onOnlineUsers)
      socket.off("userPresenceChanged", onUserPresenceChanged)
      socket.off("newMessage", onNewMessage)
      socket.off("messageDeleted", onMessageDeleted)
      socket.off("userInvitedToRoom", onUserInvitedToRoom)
      socket.off("roomCreated", onRoomCreated)
      socket.off("directRoomOpened", onDirectRoomOpened)
    }
  }, [refreshUnreadSummary, router, socket, syncOnlinePresence, user?.id, user?.username])

  const handleCreateChat = useCallback(
    (targetUserId: string) => {
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

      setRooms((prev) =>
        prependDirectRoomIfMissing(prev, {
          userId: targetUser.id,
          title: targetUser.username,
          isOnline: onlineUserIdsRef.current.has(targetUser.id),
        }),
      )

      socket.emit("openDirectRoom", { targetUserId: targetUser.id })
    },
    [router, socket, user, usersById],
  )

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
