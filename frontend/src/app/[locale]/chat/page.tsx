"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import ChatList, { type ChatCreateCandidate, type ChatListItem } from "@/components/ChatList/ChatList"
import { getInitials } from "@/lib/utils"
import { usePathname, useRouter } from "@/i18n/navigation"
import { useAuth } from "@/hooks/useAuth"
import { getAuthToken } from "@/lib/auth"
import { type UnreadSummaryResponse, type UnreadSummaryRoomLastMessage } from "@/lib/push"
import {
  fetchUnreadSummaryForQuery,
  pushUnreadSummaryQueryKey,
} from "@/lib/queries/pushQueries"
import { getUserIdFromJwt } from "@/lib/jwtUser"
import { fetchRoomMessagesOrThrow } from "@/lib/chatMessagesApi"
import { chatRoomHistoryQueryKey } from "@/lib/chatQueryKeys"
import { chatMyRoomsQueryKey } from "@/lib/chatRoomsQuery"
import { usePresenceSocket } from "@/components/PresenceSocket/PresenceSocket"
import { chatMessagePreview } from "@/lib/chatMessagePreview"
import { normalizeNotificationBody, showChatNotification } from "@/lib/notifications"
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl"
import { canSeeVerseNotesNav } from "@/lib/verseNotesNav"
import { canSeeAdminPanelNav } from "@/lib/adminDashboardNav"
import {
  GLOBAL_CHAT_AVATAR_SRC,
  GLOBAL_CHAT_TITLE,
  GLOBAL_ROOM_ID,
  GLOBAL_ROOM_SLUG,
  SHARE_WITH_JESUS_CHAT_ID,
  SHARE_WITH_JESUS_SLUG,
  getDirectTargetUserId,
  isShareWithJesusRoomTitle,
} from "@/lib/chatRooms"

function createGlobalChatItem(globalTitle: string, overrides?: Partial<ChatListItem>): ChatListItem {
  return {
    id: GLOBAL_ROOM_ID,
    title: globalTitle,
    avatarInitials: getInitials(globalTitle),
    avatarImage: GLOBAL_CHAT_AVATAR_SRC,
    href: `/chat/${GLOBAL_ROOM_SLUG}`,
    preview: "",
    timeLabel: "",
    unread: 0,
    ...overrides,
  }
}

function createShareWithJesusChatItem(roomId: string, shareTitle: string, previous?: ChatListItem): ChatListItem {
  return {
    id: SHARE_WITH_JESUS_CHAT_ID,
    title: shareTitle,
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
  titleLoading?: boolean
  isOnline: boolean
  previous?: ChatListItem
  lastActivityAt?: string
  avatarUrl?: string | null
  lastSeenAt?: string | null
  peerIsVip?: boolean
}

function getGlobalRoomFromPrevious(rooms: ChatListItem[], globalTitle: string) {
  const previousGlobal = rooms.find((room) => room.id === GLOBAL_ROOM_ID)

  return createGlobalChatItem(globalTitle, {
    preview: previousGlobal?.preview ?? "",
    timeLabel: previousGlobal?.timeLabel ?? "",
    unread: previousGlobal?.unread ?? 0,
  })
}

function createDirectRoomItem({
  userId,
  title,
  titleLoading = false,
  isOnline,
  previous,
  lastActivityAt,
  avatarUrl,
  lastSeenAt,
  peerIsVip,
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
    titleLoading,
    avatarInitials: getInitials(title),
    ...(avatarImage ? { avatarImage } : {}),
    href: `/chat/${userId}`,
    preview: previous?.preview ?? "",
    timeLabel: previous?.timeLabel ?? "",
    lastActivityAt: lastActivityAt ?? previous?.lastActivityAt,
    unread: previous?.unread ?? 0,
    isOnline,
    lastSeenAt: lastSeenAt ?? previous?.lastSeenAt,
    peerIsVip: peerIsVip ?? previous?.peerIsVip,
  }
}

/** Порядок: «Поділися з Ісусом» → загальний чат → приватні (за lastActivityAt, нові зверху). */
function orderChatListRows(rooms: ChatListItem[], sortLocale: string): ChatListItem[] {
  const shareWithJesusRoom = rooms.find((room) => room.id === SHARE_WITH_JESUS_CHAT_ID)
  const globalRoom = rooms.find((room) => room.id === GLOBAL_ROOM_ID)
  const directRooms = rooms.filter((room) => room.id !== GLOBAL_ROOM_ID && room.id !== SHARE_WITH_JESUS_CHAT_ID)

  const sortedDirectRooms = [...directRooms].sort((leftRoom, rightRoom) => {
    const leftTs = leftRoom.lastActivityAt ? new Date(leftRoom.lastActivityAt).getTime() : 0
    const rightTs = rightRoom.lastActivityAt ? new Date(rightRoom.lastActivityAt).getTime() : 0
    if (leftTs !== rightTs) {
      return rightTs - leftTs
    }
    const byTitle = leftRoom.title.localeCompare(rightRoom.title, sortLocale, { sensitivity: "base" })
    if (byTitle !== 0) {
      return byTitle
    }
    return leftRoom.id.localeCompare(rightRoom.id)
  })

  return [...(shareWithJesusRoom ? [shareWithJesusRoom] : []), ...(globalRoom ? [globalRoom] : []), ...sortedDirectRooms]
}

function prependDirectRoomIfMissing(
  rooms: ChatListItem[],
  input: DirectRoomItemInput,
  globalTitle: string,
  shareTitle: string,
  sortLocale: string,
) {
  if (rooms.some((room) => room.id === input.userId)) {
    return rooms
  }

  const globalRoom = getGlobalRoomFromPrevious(rooms, globalTitle)
  const shareWithJesusRoom = getShareWithJesusRoomFromPrevious(rooms)
  const directRooms = rooms.filter((room) => room.id !== GLOBAL_ROOM_ID && room.id !== SHARE_WITH_JESUS_CHAT_ID)

  const newDirect = createDirectRoomItem({
    ...input,
    lastActivityAt: input.lastActivityAt ?? new Date().toISOString(),
  })

  return shareWithJesusRoom
    ? orderChatListRows([shareWithJesusRoom, globalRoom, newDirect, ...directRooms], sortLocale)
    : orderChatListRows([globalRoom, newDirect, ...directRooms], sortLocale)
}

function prependShareWithJesusRoomIfMissing(
  rooms: ChatListItem[],
  roomId: string | undefined,
  globalTitle: string,
  shareTitle: string,
  sortLocale: string,
) {
  if (!roomId || rooms.some((room) => room.id === SHARE_WITH_JESUS_CHAT_ID)) {
    return rooms
  }

  const globalRoom = getGlobalRoomFromPrevious(rooms, globalTitle)
  const directRooms = rooms.filter((room) => room.id !== GLOBAL_ROOM_ID && room.id !== SHARE_WITH_JESUS_CHAT_ID)

  return orderChatListRows([createShareWithJesusChatItem(roomId, shareTitle), globalRoom, ...directRooms], sortLocale)
}

type ChatListRuntimeCache = {
  userId?: string
  rooms: ChatListItem[]
  onlineUserIds: string[]
  roomIdToDirectUserId: Array<[string, string]>
  directUserIdToRoomId: Array<[string, string]>
}

let chatListRuntimeCache: ChatListRuntimeCache | null = null

type RoomSocketItem = {
  id: string
  title: string
  createdAt?: string
  directPeer?: {
    id: string
    username: string
    nickname?: string | null
    avatarUrl?: string | null
    lastSeenAt?: string | null
    isVip?: boolean
  }
}

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
  targetUsername?: string
}

type OnlineUsersSocketPayload = {
  userIds?: string[]
  count?: number
}

type UserPresenceChangedSocketPayload = {
  userId: string
  isOnline: boolean
  lastSeenAt?: string | null
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

/** Порівняння часу останньої активності за мілісекундами (різні ISO-рядки одного моменту не дають хибного оновлення). */
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

/** Єдиний ключ для зіставлення roomId з API і ref (Postgres/Prisma інколи віддають UUID в іншому регістрі). */
function summaryRoomKey(roomId: string): string {
  return roomId.trim().toLowerCase()
}

/** Нормалізація id для мапінгу «співрозмовник у списку ↔ roomId на сервері» (dm:title і JWT можуть відрізнятися регістром). */
function canonicalChatUuidKey(id: string): string {
  return summaryRoomKey(id)
}

function getDirectServerRoomIdForListRow(
  listRowId: string,
  peerToRoom: Map<string, string>,
): string | undefined {
  if (listRowId === SHARE_WITH_JESUS_CHAT_ID) {
    return peerToRoom.get(SHARE_WITH_JESUS_CHAT_ID)
  }
  return peerToRoom.get(listRowId) ?? peerToRoom.get(canonicalChatUuidKey(listRowId))
}

function readChatListText(value: unknown, preferredKey: "title" | "preview"): string {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number") {
    return String(value)
  }
  if (value && typeof value === "object") {
    const nested = (value as Record<string, unknown>)[preferredKey]
    if (typeof nested === "string") {
      return nested
    }
  }
  return ""
}

function normalizeChatListItemForRender(room: ChatListItem): ChatListItem {
  return {
    ...room,
    title: readChatListText(room.title, "title"),
    preview: readChatListText(room.preview, "preview"),
    timeLabel: readChatListText(room.timeLabel, "preview"),
  }
}

export default function ChatPage() {
  const t = useTranslations("chat")
  const locale = useLocale()
  const sortLocale = locale === "ua" ? "uk" : locale === "en" ? "en" : "ru"
  const { user, users, loading } = useAuth()
  const { socket } = usePresenceSocket()
  const queryClient = useQueryClient()
  const globalChatTitle = t("globalChatTitle")
  const shareWithJesusTitle = t("shareWithJesusTitle")
  const previewYouLabel = t("previewYou")

  const formatRoomPreviewFromLastMessage = useCallback(
    (roomId: string, lastMessage: UnreadSummaryRoomLastMessage, currentUsername?: string) => {
      const strippedMeta = normalizeNotificationBody(lastMessage.content) || lastMessage.content
      const previewBody = chatMessagePreview({ content: strippedMeta }).trim()
      if (!previewBody) {
        return ""
      }

      if (roomId === GLOBAL_ROOM_ID) {
        return `${lastMessage.senderUsername}: ${previewBody}`
      }

      if (lastMessage.senderUsername === currentUsername) {
        return `${previewYouLabel}: ${previewBody}`
      }

      return previewBody
    },
    [previewYouLabel],
  )

  const chatI18nRef = useRef({
    globalTitle: globalChatTitle,
    shareTitle: shareWithJesusTitle,
    sortLocale,
    anonymousUser: t("anonymousUser"),
    peerInNotification: t("peerInNotification"),
    notificationGlobal: (sender: string) => t("notificationGlobal", { sender }),
    notificationDirect: (name: string) => t("notificationDirect", { name }),
    deleteListItemFailed: t("deleteListItemFailed"),
    userNotFound: t("userNotFound"),
    selfChatDenied: t("selfChatDenied"),
    socketDisconnectedShort: t("socketDisconnectedShort"),
    socketDisconnectedDot: t("socketDisconnectedDot"),
    roomUnknown: t("roomUnknown"),
    noChatConnection: t("noChatConnection"),
  })
  useEffect(() => {
    chatI18nRef.current = {
      globalTitle: globalChatTitle,
      shareTitle: shareWithJesusTitle,
      sortLocale,
      anonymousUser: t("anonymousUser"),
      peerInNotification: t("peerInNotification"),
      notificationGlobal: (sender: string) => t("notificationGlobal", { sender }),
      notificationDirect: (name: string) => t("notificationDirect", { name }),
      deleteListItemFailed: t("deleteListItemFailed"),
      userNotFound: t("userNotFound"),
      selfChatDenied: t("selfChatDenied"),
      socketDisconnectedShort: t("socketDisconnectedShort"),
      socketDisconnectedDot: t("socketDisconnectedDot"),
      roomUnknown: t("roomUnknown"),
      noChatConnection: t("noChatConnection"),
    }
  }, [globalChatTitle, shareWithJesusTitle, sortLocale, t])

  const [rooms, setRooms] = useState<ChatListItem[]>(() => [createGlobalChatItem(GLOBAL_CHAT_TITLE)])
  const [hasReceivedMyRooms, setHasReceivedMyRooms] = useState(false)
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  // Ці refs потрібні socket listeners, щоб завжди читати актуальний стан між рендерами.
  const roomsRef = useRef<ChatListItem[]>([createGlobalChatItem(GLOBAL_CHAT_TITLE)])
  const usersRef = useRef(users)
  const onlineUserIdsRef = useRef<Set<string>>(new Set())
  const currentUserIdRef = useRef<string | undefined>(undefined)
  const activeRoomIdRef = useRef<string | null>(null)
  const roomIdToDirectUserIdRef = useRef<Map<string, string>>(new Map())
  const directUserIdToRoomIdRef = useRef<Map<string, string>>(new Map())
  const lastDirectMapSizeRef = useRef(-1)
  const lastMyRoomsEmitAtRef = useRef(0)
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  const router = useRouter()

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
        if (room.id === GLOBAL_ROOM_ID || room.id === SHARE_WITH_JESUS_CHAT_ID) {
          return room
        }

        // У списку id приватного чату = userId співрозмовника; onlineUserIds із сокета можуть відрізнятися регістром UUID.
        const isOnline =
          nextOnlineIds.has(room.id) || nextOnlineIds.has(canonicalChatUuidKey(room.id))
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
      const summaryByRoomId = new Map(
        summary.rooms.map((roomSummary) => [summaryRoomKey(roomSummary.roomId), roomSummary]),
      )

      setRooms((prev) => {
        let hasUpdates = false

        const nextRooms = prev.map((room) => {
          const rawSourceId =
            room.id === GLOBAL_ROOM_ID
              ? GLOBAL_ROOM_ID
              : getDirectServerRoomIdForListRow(room.id, directUserIdToRoomIdRef.current)

          if (!rawSourceId) {
            return room
          }

          const sourceRoomId = summaryRoomKey(rawSourceId)
          const summaryRoom = summaryByRoomId.get(sourceRoomId)
          const nextUnread = summaryRoom ? Math.max(0, Number(summaryRoom.unread) || 0) : 0
          const formattedPreview = summaryRoom?.lastMessage
            ? formatRoomPreviewFromLastMessage(rawSourceId, summaryRoom.lastMessage, user?.username)
            : ""
          const nextPreview =
            formattedPreview.trim() !== "" ? formattedPreview : (room.preview ?? "")
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
            lastSeenAt: room.lastSeenAt,
            peerIsVip: room.peerIsVip,
          }
        })

        const orderedRooms = orderChatListRows(nextRooms, sortLocale)
        const hasOrderChanges = orderedRooms.some((room, index) => room.id !== prev[index]?.id)

        return hasUpdates || hasOrderChanges ? orderedRooms : prev
      })
    },
    [formatRoomPreviewFromLastMessage, sortLocale, user?.username],
  )

  const refreshUnreadSummary = useCallback(async () => {
    const token = getAuthToken()
    if (!token) {
      return
    }
    await queryClient.invalidateQueries({
      queryKey: pushUnreadSummaryQueryKey(user?.id),
    })
  }, [queryClient, user?.id])

  const requestMyRooms = useCallback((targetSocket: { emit: (event: string) => void } | null | undefined) => {
    if (!targetSocket) return
    const now = Date.now()
    if (now - lastMyRoomsEmitAtRef.current < 350) {
      return
    }
    lastMyRoomsEmitAtRef.current = now
    targetSocket.emit("getMyRooms")
  }, [])

  const unreadSummaryQuery = useQuery({
    queryKey: pushUnreadSummaryQueryKey(user?.id),
    enabled: Boolean(user?.id),
    queryFn: fetchUnreadSummaryForQuery,
    staleTime: 20_000,
  })

  useEffect(() => {
    if (!unreadSummaryQuery.data) {
      return
    }
    applyUnreadSummary(unreadSummaryQuery.data)
  }, [applyUnreadSummary, unreadSummaryQuery.data, hasReceivedMyRooms])

  const usersById = useMemo(() => {
    return new Map(users.map((existingUser) => [existingUser.id, existingUser]))
  }, [users])

  const chatCreateCandidates = useMemo<ChatCreateCandidate[]>(() => {
    const directChatUserIds = new Set(
      rooms
        .filter((room) => room.id !== GLOBAL_ROOM_ID && room.id !== SHARE_WITH_JESUS_CHAT_ID)
        .map((room) => canonicalChatUuidKey(room.id)),
    )

    return users
      .filter((existingUser) => existingUser.id !== user?.id)
      .map((existingUser) => ({
        id: existingUser.id,
        username: existingUser.nickname ?? existingUser.username,
        handle: existingUser.username,
        email: existingUser.email,
        isOnline: onlineUserIds.has(existingUser.id),
        hasDirectChat: directChatUserIds.has(canonicalChatUuidKey(existingUser.id)),
        avatarUrl: existingUser.avatarUrl,
      }))
      .sort((leftUser, rightUser) => {
        if (leftUser.hasDirectChat !== rightUser.hasDirectChat) {
          return leftUser.hasDirectChat ? 1 : -1
        }

        if (leftUser.isOnline !== rightUser.isOnline) {
          return leftUser.isOnline ? -1 : 1
        }

        return leftUser.handle.localeCompare(rightUser.handle, sortLocale, { sensitivity: "base" })
      })
  }, [onlineUserIds, rooms, sortLocale, user?.id, users])

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
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setRooms((prev) =>
        prev.map((room) => {
          if (room.id === GLOBAL_ROOM_ID) {
            return { ...room, title: globalChatTitle, avatarInitials: getInitials(globalChatTitle) }
          }
          if (room.id === SHARE_WITH_JESUS_CHAT_ID) {
            return { ...room, title: shareWithJesusTitle, avatarInitials: getInitials(shareWithJesusTitle) }
          }
          return room
        }),
      )
    })

    return () => {
      cancelled = true
    }
  }, [globalChatTitle, shareWithJesusTitle])

  useEffect(() => {
    if (!chatListRuntimeCache) {
      return
    }

    const cache = chatListRuntimeCache

    const token = getAuthToken()
    const tokenUserId = token ? getUserIdFromJwt(token) : undefined
    if (tokenUserId && cache.userId && tokenUserId !== cache.userId) {
      return
    }

    currentUserIdRef.current = cache.userId ?? currentUserIdRef.current

    const cachedOnlineIds = new Set(cache.onlineUserIds)
    onlineUserIdsRef.current = cachedOnlineIds

    roomIdToDirectUserIdRef.current = new Map(cache.roomIdToDirectUserId)
    directUserIdToRoomIdRef.current = new Map(cache.directUserIdToRoomId)

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setOnlineUserIds(cachedOnlineIds)
      setRooms(
        cache.rooms.length ? cache.rooms : [createGlobalChatItem(GLOBAL_CHAT_TITLE)],
      )
      if (cache.rooms.length > 0) {
        setHasReceivedMyRooms(true)
      }
    })

    return () => {
      cancelled = true
    }
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

  /** Повторний запит зведення після появи мапінгу userId ↔ roomId (усуває гонку з першим fetch). */
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
      requestMyRooms(socket)
      pendingMyRoomsAfterUsersRef.current = false
    }

    const usersMap = new Map<string, (typeof users)[number]>()
    for (const existingUser of users) {
      usersMap.set(existingUser.id, existingUser)
      usersMap.set(canonicalChatUuidKey(existingUser.id), existingUser)
    }

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setRooms((prev) => {
        let hasUpdates = false

        const nextRooms = prev.map((room) => {
          if (room.id === GLOBAL_ROOM_ID || room.id === SHARE_WITH_JESUS_CHAT_ID) {
            return room
          }

          const matchedUser = usersMap.get(room.id) ?? usersMap.get(canonicalChatUuidKey(room.id))
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
            titleLoading: false,
            avatarInitials: getInitials(displayTitle),
            avatarImage: nextAvatar,
          }
        })

        return hasUpdates ? nextRooms : prev
      })
    })

    return () => {
      cancelled = true
    }
  }, [requestMyRooms, socket, users])

  useEffect(() => {
    if (!socket) {
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled) return
        syncOnlinePresence(new Set())
      })
      return () => {
        cancelled = true
      }
    }

    const token = getAuthToken()
    if (!token) return

    if (!currentUserIdRef.current) {
      currentUserIdRef.current = getUserIdFromJwt(token)
    }

    /** Лише запит списку кімнат; зведення непрочитаного оновлює `myRooms` (інакше подвійний fetch і смикання порядку). */
    const syncRoomsFromServer = () => {
      requestMyRooms(socket)
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
      setHasReceivedMyRooms(true)
      queryClient.setQueryData(chatMyRoomsQueryKey(user?.id), socketRooms)
      const previousRooms = roomsRef.current

      if (!socketRooms.length) {
        roomIdToDirectUserIdRef.current = new Map()
        directUserIdToRoomIdRef.current = new Map()
        const i18n = chatI18nRef.current
        setRooms([createGlobalChatItem(i18n.globalTitle)])
        void refreshUnreadSummary()
        return
      }

      const previousById = new Map(previousRooms.map((room) => [room.id, room]))
      const usersById = new Map<string, (typeof usersRef.current)[number]>()
      for (const existingUser of usersRef.current) {
        usersById.set(existingUser.id, existingUser)
        usersById.set(canonicalChatUuidKey(existingUser.id), existingUser)
      }
      const i18nRooms = chatI18nRef.current
      const globalRoom = getGlobalRoomFromPrevious(previousRooms, i18nRooms.globalTitle)
      const previousShareWithJesusRoom = getShareWithJesusRoomFromPrevious(previousRooms)

      const nextRoomToUser = new Map<string, string>()
      const nextUserToRoom = new Map<string, string>()

      const directChatsByUserId = new Map<string, ChatListItem>()
      let shareWithJesusRoom: ChatListItem | undefined

      const resolvedCurrentUserId = user?.id ?? currentUserIdRef.current

      socketRooms
        .filter((room) => room.id !== GLOBAL_ROOM_ID)
        .forEach((room) => {
          if (isShareWithJesusRoomTitle(room.title)) {
            nextRoomToUser.set(canonicalChatUuidKey(room.id), SHARE_WITH_JESUS_CHAT_ID)
            nextUserToRoom.set(SHARE_WITH_JESUS_CHAT_ID, room.id)
            shareWithJesusRoom = createShareWithJesusChatItem(room.id, i18nRooms.shareTitle, previousShareWithJesusRoom)
            return
          }

          const targetUserId = getDirectTargetUserId(room.title, resolvedCurrentUserId)
          if (!targetUserId || targetUserId === resolvedCurrentUserId) return

          const peerListId = canonicalChatUuidKey(targetUserId)
          const targetUser = usersById.get(targetUserId) ?? usersById.get(peerListId)
          const directPeer = room.directPeer
          const previous = previousById.get(targetUserId) ?? previousById.get(peerListId)
          const directTitle = targetUser?.nickname ?? targetUser?.username ?? directPeer?.nickname ?? directPeer?.username ?? ""
          const resolvedAvatarUrl = targetUser?.avatarUrl ?? directPeer?.avatarUrl
          const titleLoading = !targetUser && !directPeer

          nextRoomToUser.set(canonicalChatUuidKey(room.id), peerListId)
          nextUserToRoom.set(peerListId, room.id)

          if (!directChatsByUserId.has(peerListId)) {
            directChatsByUserId.set(
              peerListId,
              createDirectRoomItem({
                userId: peerListId,
                title: directTitle,
                titleLoading,
                previous,
                isOnline: onlineUserIdsRef.current.has(targetUserId),
                /** Не перезаписувати час останнього повідомлення датою створення кімнати — інакше список стрибає до приходу unread-summary. */
                lastActivityAt: previous?.lastActivityAt ?? room.createdAt,
                avatarUrl: resolvedAvatarUrl,
                lastSeenAt: directPeer?.lastSeenAt ?? null,
                peerIsVip: Boolean(directPeer?.isVip),
              }),
            )
          }
        })

      roomIdToDirectUserIdRef.current = nextRoomToUser
      directUserIdToRoomIdRef.current = nextUserToRoom

      setRooms(
        orderChatListRows(
          [
            ...(shareWithJesusRoom ? [shareWithJesusRoom] : []),
            globalRoom,
            ...Array.from(directChatsByUserId.values()),
          ],
          i18nRooms.sortLocale,
        ),
      )

      const summaryUserId = user?.id ?? currentUserIdRef.current
      const cachedUnread = summaryUserId
        ? queryClient.getQueryData<UnreadSummaryResponse>(pushUnreadSummaryQueryKey(summaryUserId))
        : undefined
      if (cachedUnread) {
        queueMicrotask(() => {
          applyUnreadSummary(cachedUnread)
        })
      }

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
        const i18n = chatI18nRef.current
        const globalRoom = getGlobalRoomFromPrevious(prev, i18n.globalTitle)
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

      const onlineUnchanged = areSetsEqual(onlineUserIdsRef.current, nextOnlineIds)
      if (!onlineUnchanged) {
        syncOnlinePresence(nextOnlineIds)
      }

      const peerKey = canonicalChatUuidKey(payload.userId)
      setRooms((prev) => {
        let changed = false
        const next = prev.map((room) => {
          if (room.id === GLOBAL_ROOM_ID || room.id === SHARE_WITH_JESUS_CHAT_ID) {
            return room
          }
          if (canonicalChatUuidKey(room.id) !== peerKey) {
            return room
          }
          const nextLastSeen = payload.isOnline
            ? room.lastSeenAt
            : (payload.lastSeenAt ?? room.lastSeenAt)
          if (room.lastSeenAt === nextLastSeen) {
            return room
          }
          changed = true
          return { ...room, lastSeenAt: nextLastSeen }
        })
        return changed ? next : prev
      })
    }
    socket.on("userPresenceChanged", onUserPresenceChanged)

    const onNewMessage = (msg: NewMessageSocketEvent) => {
      const directUserId =
        roomIdToDirectUserIdRef.current.get(msg.roomId) ??
        roomIdToDirectUserIdRef.current.get(canonicalChatUuidKey(msg.roomId))
      const mappedId = msg.roomId === GLOBAL_ROOM_ID ? GLOBAL_ROOM_ID : directUserId
      const normalizedContent = chatMessagePreview({
        content: msg.content ?? "",
        type: msg.type,
        fileUrl: msg.fileUrl,
      })

      if (!mappedId) {
        requestMyRooms(socket)
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

      const directRoomId = directUserId
        ? directUserIdToRoomIdRef.current.get(directUserId) ??
          directUserIdToRoomIdRef.current.get(canonicalChatUuidKey(directUserId))
        : undefined
      const active = activeRoomIdRef.current
      const isActiveRoom =
        (active != null &&
          canonicalChatUuidKey(String(active)) === canonicalChatUuidKey(String(mappedId))) ||
        (Boolean(directRoomId) && active === directRoomId)

      const currentPath = pathnameRef.current ?? ""
      const shouldShowNotification = !isOwnMessage && shouldShowListNotification(isActiveRoom, currentPath)

      if (shouldShowNotification) {
        const i18n = chatI18nRef.current
        const mappedRoom = roomsRef.current.find(
          (room) => canonicalChatUuidKey(room.id) === canonicalChatUuidKey(String(mappedId)),
        )
        const mappedRoomId = mappedId === SHARE_WITH_JESUS_CHAT_ID ? directRoomId || msg.roomId : mappedId
        const notificationTitle =
          mappedId === GLOBAL_ROOM_ID
            ? i18n.notificationGlobal(msg.username ?? i18n.anonymousUser)
            : i18n.notificationDirect(mappedRoom?.title ?? i18n.peerInNotification)

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
          const currentUserId = user?.id
          const skipSelfDirect =
            currentUserId != null &&
            mappedId !== GLOBAL_ROOM_ID &&
            canonicalChatUuidKey(currentUserId) === canonicalChatUuidKey(String(mappedId))
          const baseRooms =
            !hasRoomInList && mappedId !== GLOBAL_ROOM_ID && !skipSelfDirect
              ? mappedId === SHARE_WITH_JESUS_CHAT_ID
                ? prependShareWithJesusRoomIfMissing(
                    prev,
                    directRoomId,
                    chatI18nRef.current.globalTitle,
                    chatI18nRef.current.shareTitle,
                    chatI18nRef.current.sortLocale,
                  )
                : prependDirectRoomIfMissing(
                    prev,
                    {
                      userId: mappedId,
                      title:
                        (() => {
                          const u = usersRef.current.find(
                            (existingUser) =>
                              existingUser.id === mappedId ||
                              canonicalChatUuidKey(existingUser.id) === canonicalChatUuidKey(String(mappedId)),
                          )
                          return u?.nickname ?? u?.username ?? ""
                        })(),
                      titleLoading: !usersRef.current.some(
                        (existingUser) =>
                          existingUser.id === mappedId ||
                          canonicalChatUuidKey(existingUser.id) === canonicalChatUuidKey(String(mappedId)),
                      ),
                      isOnline:
                        onlineUserIdsRef.current.has(mappedId) ||
                        onlineUserIdsRef.current.has(String(mappedId)),
                      lastActivityAt: msg.createdAt,
                      avatarUrl: usersRef.current.find(
                        (existingUser) =>
                          existingUser.id === mappedId ||
                          canonicalChatUuidKey(existingUser.id) === canonicalChatUuidKey(String(mappedId)),
                      )?.avatarUrl,
                      peerIsVip: Boolean(
                        usersRef.current.find(
                          (existingUser) =>
                            existingUser.id === mappedId ||
                            canonicalChatUuidKey(existingUser.id) === canonicalChatUuidKey(String(mappedId)),
                        )?.isVip,
                      ),
                    },
                    chatI18nRef.current.globalTitle,
                    chatI18nRef.current.shareTitle,
                    chatI18nRef.current.sortLocale,
                  )
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

          return orderChatListRows(mapped, chatI18nRef.current.sortLocale)
        })(),
      )
    }
    socket.on("newMessage", onNewMessage)

    const onMessageDeleted = () => {
      void refreshUnreadSummary()
    }
    socket.on("messageDeleted", onMessageDeleted)

    const onUserInvitedToRoom = () => {
      requestMyRooms(socket)
      void refreshUnreadSummary()
    }
    socket.on("userInvitedToRoom", onUserInvitedToRoom)

    const onRoomCreated = () => {
      requestMyRooms(socket)
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
        window.alert(
          typeof payload?.error === "string" ? payload.error : chatI18nRef.current.deleteListItemFailed,
        )
        return
      }

      const removedRoomId = payload.roomId
      if (!removedRoomId) {
        void refreshUnreadSummary()
        return
      }

      const listIdForRoom =
        roomIdToDirectUserIdRef.current.get(removedRoomId) ??
        roomIdToDirectUserIdRef.current.get(canonicalChatUuidKey(removedRoomId))
      if (
        listIdForRoom &&
        activeRoomIdRef.current &&
        canonicalChatUuidKey(activeRoomIdRef.current) === canonicalChatUuidKey(listIdForRoom)
      ) {
        router.push("/chat")
      }

      void refreshUnreadSummary()
    }
    socket.on("removeSelfFromRoomResult", onRemoveSelfFromRoomResult)

    const onDirectRoomOpened = (payload: DirectRoomOpenedSocketEvent) => {
      if (payload?.roomId && payload?.targetUserId) {
        const canonRoom = canonicalChatUuidKey(payload.roomId)
        const canonPeer = canonicalChatUuidKey(payload.targetUserId)
        roomIdToDirectUserIdRef.current.set(canonRoom, canonPeer)
        directUserIdToRoomIdRef.current.set(canonPeer, payload.roomId)
      }

      const targetUserId = payload?.targetUserId
      const peerListId = targetUserId ? canonicalChatUuidKey(targetUserId) : undefined
      if (peerListId && peerListId !== canonicalChatUuidKey(user?.id ?? "")) {
        const targetUser =
          usersRef.current.find((existingUser) => existingUser.id === targetUserId) ??
          usersRef.current.find((existingUser) => canonicalChatUuidKey(existingUser.id) === peerListId)
        const directTitle = targetUser?.nickname ?? targetUser?.username ?? payload?.targetUsername ?? ""
        const titleLoading = !targetUser && !payload?.targetUsername

        setRooms((prev) =>
          prependDirectRoomIfMissing(
            prev,
            {
              userId: peerListId,
              title: directTitle,
              titleLoading,
              isOnline:
                onlineUserIdsRef.current.has(targetUserId ?? "") ||
                Boolean(peerListId && onlineUserIdsRef.current.has(peerListId)),
              avatarUrl: targetUser?.avatarUrl,
            },
            chatI18nRef.current.globalTitle,
            chatI18nRef.current.shareTitle,
            chatI18nRef.current.sortLocale,
          ),
        )
      }

      if (payload?.targetUserId) {
        router.push(`/chat/${canonicalChatUuidKey(payload.targetUserId)}`)
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
  }, [
    applyUnreadSummary,
    queryClient,
    refreshUnreadSummary,
    requestMyRooms,
    router,
    socket,
    syncOnlinePresence,
    user?.id,
    user?.username,
  ])

  const handleCreateChat = useCallback(
    (targetUserId: string) => {
      if (!user) return

      const targetUser = usersById.get(targetUserId)
      if (!targetUser) {
        window.alert(chatI18nRef.current.userNotFound)
        return
      }

      if (targetUser.id === user.id) {
        window.alert(chatI18nRef.current.selfChatDenied)
        return
      }

      const existingDirectRoomId =
        directUserIdToRoomIdRef.current.get(targetUser.id) ??
        directUserIdToRoomIdRef.current.get(canonicalChatUuidKey(targetUser.id))
      if (existingDirectRoomId) {
        router.push(`/chat/${canonicalChatUuidKey(targetUser.id)}`)
        return
      }

      if (!socket || !socket.connected) {
        window.alert(chatI18nRef.current.socketDisconnectedShort)
        return
      }

      const peerId = canonicalChatUuidKey(targetUser.id)
      const i18n = chatI18nRef.current
      setRooms((prev) =>
        prependDirectRoomIfMissing(
          prev,
          {
            userId: peerId,
            title: targetUser.nickname ?? targetUser.username,
            isOnline:
              onlineUserIdsRef.current.has(targetUser.id) ||
              onlineUserIdsRef.current.has(peerId),
            avatarUrl: targetUser.avatarUrl,
            peerIsVip: Boolean(targetUser.isVip),
          },
          i18n.globalTitle,
          i18n.shareTitle,
          i18n.sortLocale,
        ),
      )

      router.push(`/chat/${peerId}`)
      socket.emit("openDirectRoom", { targetUserId: targetUser.id })
    },
    [router, socket, user, usersById],
  )

  const handleDeleteChat = useCallback(
    (listItemId: string) => {
      const serverRoomId =
        directUserIdToRoomIdRef.current.get(listItemId) ??
        directUserIdToRoomIdRef.current.get(canonicalChatUuidKey(listItemId))
      if (!serverRoomId) {
        window.alert(chatI18nRef.current.roomUnknown)
        requestMyRooms(socket)
        return
      }

      if (!socket?.connected) {
        window.alert(chatI18nRef.current.socketDisconnectedDot)
        return
      }

      socket.emit("removeSelfFromRoom", { roomId: serverRoomId })
    },
    [requestMyRooms, socket],
  )

  const handlePrefetchChat = useCallback(
    (listItemId: string) => {
      const token = getAuthToken()
      if (!token) return

      const roomId =
        listItemId === GLOBAL_ROOM_ID
          ? GLOBAL_ROOM_ID
          : directUserIdToRoomIdRef.current.get(listItemId) ??
            directUserIdToRoomIdRef.current.get(canonicalChatUuidKey(listItemId))
      if (!roomId) return

      void queryClient.prefetchQuery({
        queryKey: chatRoomHistoryQueryKey(roomId),
        queryFn: () =>
          fetchRoomMessagesOrThrow({
            token,
            roomId,
            limit: 250,
            skip: 0,
          }),
        staleTime: 20_000,
      })
    },
    [queryClient],
  )

  const chatItems = useMemo(() => {
    const base =
      rooms.length > 0
        ? rooms
        : [createGlobalChatItem(globalChatTitle, { preview: t("noChatConnection") })]

    return base.map((room) => {
      const normalizedRoom = normalizeChatListItemForRender(room)

      return {
        ...normalizedRoom,
      deletable:
          normalizedRoom.id !== GLOBAL_ROOM_ID &&
          normalizedRoom.id !== SHARE_WITH_JESUS_CHAT_ID &&
          Boolean(normalizedRoom.href),
      }
    })
  }, [globalChatTitle, rooms, t])

  const verseNotesVisible = useMemo(
    () => canSeeVerseNotesNav(user?.username),
    [user?.username],
  )
  const adminDashboardVisible = useMemo(() => canSeeAdminPanelNav(user?.username), [user?.username])
  const isChatListLoading = loading || !hasReceivedMyRooms

  return (
    <ChatList
      items={chatItems}
      onCreateChat={handleCreateChat}
      chatCandidates={chatCreateCandidates}
      onDeleteChat={handleDeleteChat}
      onPrefetchChat={handlePrefetchChat}
      verseNotesVisible={verseNotesVisible}
      adminDashboardVisible={adminDashboardVisible}
      isLoading={isChatListLoading}
    />
  )
}
