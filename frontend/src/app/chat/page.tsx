"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ChatList, { type ChatCreateCandidate, type ChatListItem } from "@/components/ChatList/ChatList"
import { getInitials } from "@/lib/utils"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { getAuthToken } from "@/lib/auth"
import { fetchUnreadSummary, type UnreadSummaryResponse, type UnreadSummaryRoomLastMessage } from "@/lib/push"
import { usePresenceSocket } from "@/components/PresenceSocket/PresenceSocket"
import { chatMessagePreview } from "@/lib/chatMessagePreview"
import { normalizeNotificationBody, showChatNotification } from "@/lib/notifications"
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl"
import {
  GLOBAL_CHAT_AVATAR_SRC,
  GLOBAL_CHAT_TITLE,
  GLOBAL_ROOM_ID,
  GLOBAL_ROOM_SLUG,
  SHARE_WITH_JESUS_CHAT_ID,
  SHARE_WITH_JESUS_CHAT_TITLE,
  SHARE_WITH_JESUS_ROOM_PREFIX,
  SHARE_WITH_JESUS_SLUG,
  getDirectTargetUserId,
  isShareWithJesusRoomTitle,
} from "@/lib/chatRooms"

function createGlobalChatItem(overrides?: Partial<ChatListItem>): ChatListItem {
  return {
    id: GLOBAL_ROOM_ID,
    title: GLOBAL_CHAT_TITLE,
    avatarInitials: getInitials(GLOBAL_CHAT_TITLE),
    avatarImage: GLOBAL_CHAT_AVATAR_SRC,
    href: `/chat/${GLOBAL_ROOM_SLUG}`,
    preview: "",
    timeLabel: "",
    unread: 0,
    ...overrides,
  }
}

const BASE_GLOBAL_CHAT_ITEM: ChatListItem = createGlobalChatItem()

function createShareWithJesusChatItem(roomId: string, previous?: ChatListItem): ChatListItem {
  return {
    id: SHARE_WITH_JESUS_CHAT_ID,
    title: SHARE_WITH_JESUS_CHAT_TITLE,
    avatarImage: "/jesus-say.svg",
    avatarClass: "jesusAvatar",
    href: `/chat/${SHARE_WITH_JESUS_SLUG}`,
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
  lastActivityAt?: string
  avatarUrl?: string | null
}

function getGlobalRoomFromPrevious(rooms: ChatListItem[]) {
  const previousGlobal = rooms.find((room) => room.id === GLOBAL_ROOM_ID)

  return createGlobalChatItem({
    preview: previousGlobal?.preview ?? "",
    timeLabel: previousGlobal?.timeLabel ?? "",
    unread: previousGlobal?.unread ?? 0,
  })
}

function createDirectRoomItem({
  userId,
  title,
  isOnline,
  previous,
  lastActivityAt,
  avatarUrl,
}: DirectRoomItemInput): ChatListItem {
  let avatarImage: string | undefined
  if (avatarUrl !== undefined) {
    avatarImage = resolvePublicAvatarUrl(avatarUrl)
  } else if (previous?.id === userId && previous.avatarImage) {
    avatarImage = previous.avatarImage
  }

  return {
    id: userId,
    title,
    avatarInitials: getInitials(title),
    ...(avatarImage ? { avatarImage } : {}),
    href: `/chat/${userId}`,
    preview: previous?.preview ?? "",
    timeLabel: previous?.timeLabel ?? "",
    lastActivityAt: lastActivityAt ?? previous?.lastActivityAt,
    unread: previous?.unread ?? 0,
    isOnline,
  }
}

/** Порядок: «Поделись с Иисусом» → общий чат → личные (по lastActivityAt, новые сверху). */
function orderChatListRows(rooms: ChatListItem[]): ChatListItem[] {
  const shareWithJesusRoom = rooms.find((room) => room.id === SHARE_WITH_JESUS_CHAT_ID)
  const globalRoom = rooms.find((room) => room.id === GLOBAL_ROOM_ID)
  const directRooms = rooms.filter((room) => room.id !== GLOBAL_ROOM_ID && room.id !== SHARE_WITH_JESUS_CHAT_ID)

  const sortedDirectRooms = [...directRooms].sort((leftRoom, rightRoom) => {
    const leftTs = leftRoom.lastActivityAt ? new Date(leftRoom.lastActivityAt).getTime() : 0
    const rightTs = rightRoom.lastActivityAt ? new Date(rightRoom.lastActivityAt).getTime() : 0
    if (leftTs !== rightTs) {
      return rightTs - leftTs
    }
    const byTitle = leftRoom.title.localeCompare(rightRoom.title, "ru", { sensitivity: "base" })
    if (byTitle !== 0) {
      return byTitle
    }
    return leftRoom.id.localeCompare(rightRoom.id)
  })

  return [...(shareWithJesusRoom ? [shareWithJesusRoom] : []), ...(globalRoom ? [globalRoom] : []), ...sortedDirectRooms]
}

function prependDirectRoomIfMissing(rooms: ChatListItem[], input: DirectRoomItemInput) {
  if (rooms.some((room) => room.id === input.userId)) {
    return rooms
  }

  const globalRoom = getGlobalRoomFromPrevious(rooms)
  const shareWithJesusRoom = getShareWithJesusRoomFromPrevious(rooms)
  const directRooms = rooms.filter((room) => room.id !== GLOBAL_ROOM_ID && room.id !== SHARE_WITH_JESUS_CHAT_ID)

  const newDirect = createDirectRoomItem({
    ...input,
    lastActivityAt: input.lastActivityAt ?? new Date().toISOString(),
  })

  return shareWithJesusRoom
    ? orderChatListRows([shareWithJesusRoom, globalRoom, newDirect, ...directRooms])
    : orderChatListRows([globalRoom, newDirect, ...directRooms])
}

function prependShareWithJesusRoomIfMissing(rooms: ChatListItem[], roomId?: string) {
  if (!roomId || rooms.some((room) => room.id === SHARE_WITH_JESUS_CHAT_ID)) {
    return rooms
  }

  const globalRoom = getGlobalRoomFromPrevious(rooms)
  const directRooms = rooms.filter((room) => room.id !== GLOBAL_ROOM_ID && room.id !== SHARE_WITH_JESUS_CHAT_ID)

  return orderChatListRows([createShareWithJesusChatItem(roomId), globalRoom, ...directRooms])
}

type ChatListRuntimeCache = {
  userId?: string
  rooms: ChatListItem[]
  onlineUserIds: string[]
  roomIdToDirectUserId: Array<[string, string]>
  directUserIdToRoomId: Array<[string, string]>
}

let chatListRuntimeCache: ChatListRuntimeCache | null = null

type RoomSocketItem = { id: string; title: string; createdAt?: string }

type NewMessageSocketEvent = {
  roomId: string
  content?: string
  type?: string
  fileUrl?: string
  createdAt: string
  username?: string
  handle?: string
  senderId?: string
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

/** Сравнение времени последней активности по миллисекундам (разные ISO-строки одного момента не дают ложного обновления). */
function lastActivityInstantMs(value: string | null | undefined): number | null {
  if (value == null || value === "") {
    return null
  }
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

function sameLastActivityAt(a: string | null | undefined, b: string | null | undefined): boolean {
  const ma = lastActivityInstantMs(a)
  const mb = lastActivityInstantMs(b)
  if (ma === null && mb === null) {
    return true
  }
  if (ma === null || mb === null) {
    return false
  }
  return ma === mb
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
  const lastDirectMapSizeRef = useRef(-1)
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  const router = useRouter()

  /** На каждом рендере — чтобы обработчик `myRooms` не читал устаревший пустой список до useEffect. */
  usersRef.current = users

  const activeRoomIdPath = pathname?.startsWith("/chat/") ? pathname.replace("/chat/", "") : null
  const activeRoomId =
    activeRoomIdPath === GLOBAL_ROOM_SLUG
      ? GLOBAL_ROOM_ID
      : activeRoomIdPath === SHARE_WITH_JESUS_SLUG
        ? SHARE_WITH_JESUS_CHAT_ID
        : activeRoomIdPath

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
          const rawLastMsgAt = summaryRoom?.lastMessage?.createdAt
          const nextLastActivityAt = (() => {
            if (rawLastMsgAt == null || rawLastMsgAt === "") {
              return room.lastActivityAt
            }
            const t = new Date(rawLastMsgAt).getTime()
            if (Number.isNaN(t)) {
              return room.lastActivityAt
            }
            return new Date(t).toISOString()
          })()
          const currentUnread = typeof room.unread === "number" ? room.unread : room.unread ? 1 : 0

          if (
            currentUnread === nextUnread &&
            (room.preview ?? "") === nextPreview &&
            (room.timeLabel ?? "") === nextTimeLabel &&
            sameLastActivityAt(room.lastActivityAt, nextLastActivityAt)
          ) {
            return room
          }

          hasUpdates = true
          return {
            ...room,
            unread: nextUnread,
            preview: nextPreview,
            timeLabel: nextTimeLabel,
            lastActivityAt: nextLastActivityAt,
          }
        })

        const orderedRooms = orderChatListRows(nextRooms)
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
        username: existingUser.nickname ?? existingUser.username,
        handle: existingUser.username,
        email: existingUser.email,
        isOnline: onlineUserIds.has(existingUser.id),
        hasDirectChat: directChatUserIds.has(existingUser.id),
        avatarUrl: existingUser.avatarUrl,
      }))
      .sort((leftUser, rightUser) => {
        if (leftUser.hasDirectChat !== rightUser.hasDirectChat) {
          return leftUser.hasDirectChat ? 1 : -1
        }

        if (leftUser.isOnline !== rightUser.isOnline) {
          return leftUser.isOnline ? -1 : 1
        }

        return leftUser.handle.localeCompare(rightUser.handle, "ru", { sensitivity: "base" })
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

  /** Повторный запрос сводки после появления маппинга userId ↔ roomId (устраняет гонку с первым fetch). */
  useEffect(() => {
    const size = directUserIdToRoomIdRef.current.size
    if (size === lastDirectMapSizeRef.current) {
      return
    }
    lastDirectMapSizeRef.current = size
    if (size === 0) {
      return
    }
    void refreshUnreadSummary()
  }, [rooms, refreshUnreadSummary])

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

  const prevUsersCountRef = useRef(0)
  const pendingMyRoomsAfterUsersRef = useRef(false)

  useEffect(() => {
    if (!users.length) {
      prevUsersCountRef.current = 0
      pendingMyRoomsAfterUsersRef.current = false
      return
    }

    if (prevUsersCountRef.current === 0) {
      pendingMyRoomsAfterUsersRef.current = true
    }
    prevUsersCountRef.current = users.length

    if (pendingMyRoomsAfterUsersRef.current && socket?.connected) {
      socket.emit("getMyRooms")
      pendingMyRoomsAfterUsersRef.current = false
    }

    const usersMap = new Map(users.map((existingUser) => [existingUser.id, existingUser]))

    setRooms((prev) => {
      let hasUpdates = false

      const nextRooms = prev.map((room) => {
        if (room.id === GLOBAL_ROOM_ID || room.id === SHARE_WITH_JESUS_CHAT_ID) {
          return room
        }

        const matchedUser = usersMap.get(room.id)
        if (!matchedUser) {
          return room
        }

        const nextAvatar = resolvePublicAvatarUrl(matchedUser.avatarUrl)
        const displayTitle = matchedUser.nickname ?? matchedUser.username
        const titleSame = displayTitle === room.title
        const avatarSame = (nextAvatar ?? "") === (room.avatarImage ?? "")
        if (titleSame && avatarSame) {
          return room
        }

        hasUpdates = true
        return {
          ...room,
          title: displayTitle,
          avatarInitials: getInitials(displayTitle),
          avatarImage: nextAvatar,
        }
      })

      return hasUpdates ? nextRooms : prev
    })
  }, [socket, users])

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

    /** Только запрос списка комнат; сводку непрочитанных обновляет `myRooms` (иначе двойной fetch и дёрганье порядка). */
    const syncRoomsFromServer = () => {
      socket.emit("getMyRooms")
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
          const directTitle = targetUser?.nickname ?? targetUser?.username ?? "Личный чат"

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
                /** Не затирать время последнего сообщения датой создания комнаты — иначе список прыгает до прихода unread-summary. */
                lastActivityAt: previous?.lastActivityAt ?? room.createdAt,
                avatarUrl: targetUser?.avatarUrl,
              }),
            )
          }
        })

      roomIdToDirectUserIdRef.current = nextRoomToUser
      directUserIdToRoomIdRef.current = nextUserToRoom

      setRooms(
        orderChatListRows([
          ...(shareWithJesusRoom ? [shareWithJesusRoom] : []),
          globalRoom,
          ...Array.from(directChatsByUserId.values()),
        ]),
      )
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

        return shareWithJesusRoom ? [shareWithJesusRoom, globalRoom] : [globalRoom]
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
      const normalizedContent = chatMessagePreview({
        content: msg.content ?? "",
        type: msg.type,
        fileUrl: msg.fileUrl,
      })

      if (!mappedId) {
        socket.emit("getMyRooms")
        void refreshUnreadSummary()
        return
      }

      if (!normalizedContent.trim()) {
        return
      }

      const isOwnMessage = Boolean(
        (msg.senderId && user?.id && msg.senderId === user.id) ||
          (msg.handle && user?.username && msg.handle === user.username) ||
          (msg.username && user?.username && msg.username === user.username),
      )

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
                      (() => {
                        const u = usersRef.current.find((existingUser) => existingUser.id === mappedId)
                        return u?.nickname ?? u?.username ?? "Личный чат"
                      })(),
                    isOnline: onlineUserIdsRef.current.has(mappedId),
                    lastActivityAt: msg.createdAt,
                    avatarUrl: usersRef.current.find((existingUser) => existingUser.id === mappedId)?.avatarUrl,
                  })
              : prev

          const mapped = baseRooms.map((room) => {
            if (room.id !== mappedId) return room
            const currentUnread = typeof room.unread === "number" ? room.unread : room.unread ? 1 : 0
            const nextUnread = isActiveRoom ? 0 : isOwnMessage ? currentUnread : currentUnread + 1

            return {
              ...room,
              preview: previewContent,
              timeLabel: formatChatTimeLabel(msg.createdAt),
              unread: nextUnread,
              lastActivityAt: msg.createdAt,
            }
          })

          return orderChatListRows(mapped)
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

    type RemoveSelfFromRoomResult = {
      ok: boolean
      roomId?: string
      error?: string
    }

    const onRemoveSelfFromRoomResult = (payload: RemoveSelfFromRoomResult) => {
      if (!payload?.ok) {
        window.alert(typeof payload?.error === "string" ? payload.error : "Не удалось удалить чат")
        return
      }

      const removedRoomId = payload.roomId
      if (!removedRoomId) {
        void refreshUnreadSummary()
        return
      }

      const listIdForRoom = roomIdToDirectUserIdRef.current.get(removedRoomId)
      if (listIdForRoom && activeRoomIdRef.current === listIdForRoom) {
        router.push("/chat")
      }

      void refreshUnreadSummary()
    }
    socket.on("removeSelfFromRoomResult", onRemoveSelfFromRoomResult)

    const onDirectRoomOpened = (payload: DirectRoomOpenedSocketEvent) => {
      if (payload?.roomId && payload?.targetUserId) {
        roomIdToDirectUserIdRef.current.set(payload.roomId, payload.targetUserId)
        directUserIdToRoomIdRef.current.set(payload.targetUserId, payload.roomId)
      }

      const targetUserId = payload?.targetUserId
      if (targetUserId) {
        const targetUser = usersRef.current.find((existingUser) => existingUser.id === targetUserId)
        const directTitle = targetUser?.nickname ?? targetUser?.username ?? "Личный чат"

        setRooms((prev) =>
          prependDirectRoomIfMissing(prev, {
            userId: targetUserId,
            title: directTitle,
            isOnline: onlineUserIdsRef.current.has(targetUserId),
            avatarUrl: targetUser?.avatarUrl,
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
      socket.off("removeSelfFromRoomResult", onRemoveSelfFromRoomResult)
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
          title: targetUser.nickname ?? targetUser.username,
          isOnline: onlineUserIdsRef.current.has(targetUser.id),
          avatarUrl: targetUser.avatarUrl,
        }),
      )

      socket.emit("openDirectRoom", { targetUserId: targetUser.id })
    },
    [router, socket, user, usersById],
  )

  const handleDeleteChat = useCallback(
    (listItemId: string) => {
      const serverRoomId = directUserIdToRoomIdRef.current.get(listItemId)
      if (!serverRoomId) {
        window.alert("Не удалось определить комнату. Попробуй обновить список.")
        socket?.emit("getMyRooms")
        return
      }

      if (!socket?.connected) {
        window.alert("Сокет не подключен. Попробуй через пару секунд.")
        return
      }

      socket.emit("removeSelfFromRoom", { roomId: serverRoomId })
    },
    [socket],
  )

  const chatItems = useMemo(() => {
    const base =
      rooms.length > 0
        ? rooms
        : [
            createGlobalChatItem({
              preview: "Нет подключений к чату",
            }),
          ]

    return base.map((room) => ({
      ...room,
      deletable:
        room.id !== GLOBAL_ROOM_ID &&
        room.id !== SHARE_WITH_JESUS_CHAT_ID &&
        Boolean(room.href),
    }))
  }, [rooms])

  return (
    <ChatList
      items={chatItems}
      onCreateChat={handleCreateChat}
      chatCandidates={chatCreateCandidates}
      onDeleteChat={handleDeleteChat}
    />
  )
}
