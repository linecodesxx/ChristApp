"use client"

import ChatWindow from "@/components/ChatWindow/ChatWindow"
import CrossLoader from "@/components/CrossLoader/CrossLoader"
import styles from "./chatRoom.module.scss"
import MessageInput from "@/components/MessageInput/MessageInput"
import { isMessageFromCurrentUser, type Message, type MessageReply } from "@/types/message"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { useParams, useRouter } from "next/navigation"
import { getInitials } from "@/lib/utils"
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl"
import { useAuth } from "@/hooks/useAuth"
import { getAuthToken } from "@/lib/auth"
import { dispatchChatUnreadChangedEvent } from "@/lib/chatUnreadEvents"
import { showChatNotification } from "@/lib/notifications"
import Link from "next/link"
import Image from "next/image"
import {
  GLOBAL_ROOM_ID,
  GLOBAL_ROOM_SLUG,
  SHARE_WITH_JESUS_CHAT_TITLE,
  SHARE_WITH_JESUS_ROOM_PREFIX,
  SHARE_WITH_JESUS_SLUG,
} from "@/lib/chatRooms"

const WS_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
const SHARE_JESUS_PARCHMENT_TITLE = "Делись своими мыслями"
const SHARE_JESUS_PARCHMENT_TEXT =
  "Здесь затихает шум мира. Говори о том, что болит или радует"
const HISTORY_PAGE_SIZE = 250
const LAST_SENT_PREVIEW_STORAGE_KEY = "chat:last-sent-previews"
const REPLY_META_PREFIX = "[[reply:"
const REPLY_META_SUFFIX = "]]"
const MAX_REPLY_PREVIEW_LENGTH = 180
type IncomingSocketMessage = {
  id?: string | number
  roomId?: string
  content?: string
  createdAt?: string | Date
  username?: string
  handle?: string
  senderId?: string
  sender?: {
    id?: string
    username?: string
    nickname?: string
  }
}

type MyRoomItem = {
  id: string
  title: string
  createdAt: string
}

type DirectRoomOpenedPayload = {
  roomId: string
  targetUserId: string
  title?: string
  targetUsername?: string
}

type RoomHistoryPayload = {
  roomId: string
  messages: IncomingSocketMessage[]
}

type OnlineUsersPayload = {
  userIds: string[]
  count?: number
}

type UserPresencePayload = {
  userId: string
  isOnline: boolean
}

type MessageDeletedSocketEvent = {
  messageId?: string
  roomId?: string
}

type DeleteMessageResultSocketEvent = {
  ok?: boolean
  messageId?: string
  roomId?: string
  error?: string
}

type ShareWithJesusRoomIdResolvedPayload = {
  ok?: boolean
  roomId?: string
  roomTitle?: string
  error?: string
}

function persistLastSentPreview(roomKey: string, message: string, directUserId?: string) {
  if (typeof window === "undefined") return

  try {
    const rawValue = window.localStorage.getItem(LAST_SENT_PREVIEW_STORAGE_KEY)
    const parsed = rawValue ? (JSON.parse(rawValue) as Record<string, string>) : {}

    parsed[roomKey] = message
    if (directUserId) {
      parsed[directUserId] = message
    }

    window.localStorage.setItem(LAST_SENT_PREVIEW_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // ignore localStorage errors
  }
}

function normalizeReplyContent(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, MAX_REPLY_PREVIEW_LENGTH)
}

function serializeMessageWithReply(content: string, replyTo?: MessageReply | null) {
  const normalizedContent = content.trim()
  if (!normalizedContent || !replyTo) {
    return normalizedContent
  }

  const safeReply: MessageReply = {
    id: String(replyTo.id),
    username: (String(replyTo.username || "Unknown").trim() || "Unknown").slice(0, 60),
    content: normalizeReplyContent(String(replyTo.content || "")),
  }

  try {
    const encodedMeta = encodeURIComponent(JSON.stringify(safeReply))
    return `${REPLY_META_PREFIX}${encodedMeta}${REPLY_META_SUFFIX}${normalizedContent}`
  } catch {
    return normalizedContent
  }
}

function parseMessageWithReply(rawContent: string) {
  if (!rawContent.startsWith(REPLY_META_PREFIX)) {
    return {
      content: rawContent,
      replyTo: undefined as MessageReply | undefined,
    }
  }

  const suffixIndex = rawContent.indexOf(REPLY_META_SUFFIX, REPLY_META_PREFIX.length)
  if (suffixIndex === -1) {
    return {
      content: rawContent,
      replyTo: undefined as MessageReply | undefined,
    }
  }

  const encodedMeta = rawContent.slice(REPLY_META_PREFIX.length, suffixIndex)
  const messageContent = rawContent.slice(suffixIndex + REPLY_META_SUFFIX.length)

  try {
    const parsedMeta = JSON.parse(decodeURIComponent(encodedMeta)) as Partial<MessageReply>
    if (!parsedMeta?.id || !parsedMeta?.username) {
      return {
        content: rawContent,
        replyTo: undefined as MessageReply | undefined,
      }
    }

    return {
      content: messageContent || rawContent,
      replyTo: {
        id: String(parsedMeta.id),
        username: String(parsedMeta.username),
        content: normalizeReplyContent(String(parsedMeta.content ?? "")),
      },
    }
  } catch {
    return {
      content: rawContent,
      replyTo: undefined as MessageReply | undefined,
    }
  }
}

function areSetsEqual<T>(left: Set<T>, right: Set<T>) {
  if (left.size !== right.size) return false

  for (const value of left) {
    if (!right.has(value)) {
      return false
    }
  }

  return true
}

function shouldShowBrowserNotification(isOwnMessage: boolean) {
  return !isOwnMessage && (document.visibilityState !== "visible" || !document.hasFocus())
}

function normalizeRoomHistory(history: IncomingSocketMessage[] | undefined, currentUsername?: string) {
  const normalizedHistory = (history ?? []).map((messageItem) => normalizeIncomingMessage(messageItem, currentUsername))

  const nextMessageIds = new Set<string>()
  const uniqueHistory: Message[] = []

  for (const messageItem of normalizedHistory) {
    if (nextMessageIds.has(messageItem.id)) {
      continue
    }
    nextMessageIds.add(messageItem.id)
    uniqueHistory.push(messageItem)
  }

  return {
    uniqueHistory,
    nextMessageIds,
  }
}

function normalizeIncomingMessage(
  raw: IncomingSocketMessage | null | undefined,
  currentUsername?: string,
): Message {
  const senderId = raw?.senderId ?? raw?.sender?.id
  const handle = raw?.handle ?? raw?.sender?.username
  const displayName =
    raw?.username ?? raw?.sender?.nickname ?? raw?.sender?.username ?? "Unknown"
  const rawContent = String(raw?.content ?? "")
  const { content, replyTo } = parseMessageWithReply(rawContent)

  const legacyMe =
    Boolean(currentUsername) &&
    !senderId &&
    !handle &&
    (displayName === currentUsername || raw?.sender?.username === currentUsername)

  return {
    id: String(raw?.id ?? Date.now()),
    content,
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
    username: displayName,
    handle,
    senderId,
    sender: legacyMe || handle === currentUsername ? "me" : undefined,
    replyTo,
  }
}

function getReadableRoomTitle(
  roomId?: string,
  rawTitle?: string,
  currentUserId?: string,
  users?: Array<{ id: string; username: string; nickname?: string }>,
) {
  if (roomId === GLOBAL_ROOM_ID) return "Общий чат для всех"

  if (rawTitle?.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)) {
    return SHARE_WITH_JESUS_CHAT_TITLE
  }

  if (!rawTitle?.trim()) return "Личный чат"

  if (rawTitle.startsWith("dm:")) {
    const directIds = rawTitle.split(":").slice(1)
    const otherUserId = directIds.find((id) => id !== currentUserId)
    const otherUser = users?.find((existingUser) => existingUser.id === otherUserId)
    return otherUser ? `Чат с ${otherUser.nickname ?? otherUser.username}` : "Личный чат"
  }

  return rawTitle
}

export default function ChatPageDetails() {
  const { user, users, loading } = useAuth({ redirectIfUnauthenticated: "/" })
  // Runtime refs нужны для socket callbacks, чтобы избежать stale state внутри listeners.
  const socketRef = useRef<Socket | null>(null)
  const usersRef = useRef(users)
  const currentRoomRef = useRef<string | undefined>(undefined)
  const joinedRoomRef = useRef<string | undefined>(undefined)
  const availableRoomIdsRef = useRef<Set<string>>(new Set())
  const openingDirectRoomRef = useRef<Set<string>>(new Set())
  const messageIdsRef = useRef<Set<string>>(new Set())
  /** true после joinRoom до прихода roomHistory (в т.ч. при skipLoadingSpinner). */
  const awaitingRoomHistoryRef = useRef(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [roomTitle, setRoomTitle] = useState<string>("")
  const [roomRawTitle, setRoomRawTitle] = useState<string>("")
  const [isSocketConnected, setIsSocketConnected] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  /** Только фатальные случаи (нет токена). Обрывы сокета не показываем вместо чата. */
  const [authError, setAuthError] = useState<string | null>(null)
  const [sendNotice, setSendNotice] = useState<string | null>(null)
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null)
  const [onlineCount, setOnlineCount] = useState(0)
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(() => new Map())
  const userIdRef = useRef<string | undefined>(undefined)
  const typingEmitRef = useRef(false)

  const params = useParams<{ roomId: string }>()
  const router = useRouter()
  const routeRoomId = params?.roomId
  const roomId =
    routeRoomId === GLOBAL_ROOM_SLUG
      ? GLOBAL_ROOM_ID
      : routeRoomId === SHARE_WITH_JESUS_SLUG
        ? SHARE_WITH_JESUS_SLUG
        : routeRoomId

  const [resolvedShareJesusRoomId, setResolvedShareJesusRoomId] = useState<string | null>(null)
  const routeRoomIdRef = useRef(routeRoomId)
  routeRoomIdRef.current = routeRoomId

  const effectiveSocketRoomId = useMemo(() => {
    if (!routeRoomId) return null
    if (routeRoomId === GLOBAL_ROOM_SLUG) return GLOBAL_ROOM_ID
    if (routeRoomId === SHARE_WITH_JESUS_SLUG) return resolvedShareJesusRoomId
    return routeRoomId
  }, [routeRoomId, resolvedShareJesusRoomId])

  const markRoomAsRead = useCallback(() => {
    const target = effectiveSocketRoomId
    if (!target) return

    const socket = socketRef.current
    if (!socket || !socket.connected) return

    if (document.visibilityState !== "visible") {
      return
    }

    socket.emit("markRoomRead", { roomId: target })
    dispatchChatUnreadChangedEvent()
  }, [effectiveSocketRoomId])

  const handleTypingActivity = useCallback((active: boolean) => {
    const socket = socketRef.current
    const joinedId = joinedRoomRef.current
    if (!socket?.connected || !joinedId) return
    if (typingEmitRef.current === active) return
    typingEmitRef.current = active
    socket.emit("roomTyping", { roomId: joinedId, isTyping: active })
  }, [])

  const joinRoom = useCallback((socket: Socket, targetRoomId: string, opts?: { skipLoadingSpinner?: boolean }) => {
    if (joinedRoomRef.current === targetRoomId) {
      return
    }

    if (!opts?.skipLoadingSpinner) {
      setIsHistoryLoading(true)
    }
    awaitingRoomHistoryRef.current = true
    socket.emit("joinRoom", { roomId: targetRoomId, limit: HISTORY_PAGE_SIZE, skip: 0 })
    joinedRoomRef.current = targetRoomId
  }, [])

  const leaveCurrentRoom = useCallback((socket: Socket) => {
    const joinedRoomId = joinedRoomRef.current
    if (!joinedRoomId) {
      return
    }

    if (typingEmitRef.current) {
      typingEmitRef.current = false
      socket.emit("roomTyping", { roomId: joinedRoomId, isTyping: false })
    }

    socket.emit("leaveRoom", joinedRoomId)
    joinedRoomRef.current = undefined
  }, [])

  useEffect(() => {
    usersRef.current = users
  }, [users])

  useEffect(() => {
    userIdRef.current = user?.id
  }, [user?.id])

  useEffect(() => {
    setMessages([])
    messageIdsRef.current = new Set()
    awaitingRoomHistoryRef.current = false
    setReplyToMessage(null)
    setResolvedShareJesusRoomId(null)
    if (routeRoomId === SHARE_WITH_JESUS_SLUG && user) {
      setRoomTitle(SHARE_WITH_JESUS_CHAT_TITLE)
      setRoomRawTitle(`${SHARE_WITH_JESUS_ROOM_PREFIX}${user.id}`)
      setIsHistoryLoading(false)
    } else {
      setRoomTitle("")
      setRoomRawTitle("")
      setIsHistoryLoading(true)
    }
  }, [roomId, routeRoomId, user])

  useEffect(() => {
    setTypingUsers(new Map())
    typingEmitRef.current = false
  }, [roomId, routeRoomId, effectiveSocketRoomId])

  useEffect(() => {
    currentRoomRef.current = effectiveSocketRoomId ?? undefined
  }, [effectiveSocketRoomId])

  useEffect(() => {
    if (loading || !user || !roomId) return

    if (roomId === user.id) {
      router.replace(`/chat/${GLOBAL_ROOM_SLUG}`)
    }
  }, [loading, user, roomId, router])

  // Полный жизненный цикл socket: connect/disconnect, история, новые сообщения, presence.
  useEffect(() => {
    if (loading) return

    if (socketRef.current) {
      return
    }

    const token = getAuthToken()
    if (!token) {
      setAuthError("Нет токена авторизации")
      setIsHistoryLoading(false)
      return
    }

    const socket = io(WS_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 400,
      reconnectionDelayMax: 4000,
      randomizationFactor: 0.35,
    })

    socketRef.current = socket

    const onConnect = () => {
      setIsSocketConnected(true)
      setAuthError(null)
      setSendNotice(null)

      const rr = routeRoomIdRef.current
      if (rr === GLOBAL_ROOM_SLUG) {
        joinRoom(socket, GLOBAL_ROOM_ID)
      }

      socket.emit("getMyRooms")
    }
    socket.on("connect", onConnect)

    const onDisconnect = () => {
      setIsSocketConnected(false)
      setIsHistoryLoading((prev) => awaitingRoomHistoryRef.current || prev)
      setOnlineCount(0)
      setOnlineUserIds(new Set())
      setTypingUsers(new Map())
      typingEmitRef.current = false
      joinedRoomRef.current = undefined
    }
    socket.on("disconnect", onDisconnect)

    const onSocketError = () => {
      setIsHistoryLoading((prev) => awaitingRoomHistoryRef.current || prev)
    }
    socket.on("connect_error", onSocketError)
    socket.on("error", onSocketError)

    const onNewMessage = (msg: IncomingSocketMessage) => {
      const joinedId = joinedRoomRef.current
      if (joinedId && msg.roomId && msg.roomId !== joinedId) {
        return
      }

      const normalized = normalizeIncomingMessage(msg, user?.username)
      if (!normalized.content.trim()) {
        return
      }

      if (messageIdsRef.current.has(normalized.id)) {
        return
      }

      messageIdsRef.current.add(normalized.id)

      if (joinedId && normalized.content?.trim()) {
        persistLastSentPreview(joinedId, normalized.content.trim())
      }

      const isOwnMessage = isMessageFromCurrentUser(normalized, user)
      const shouldShowNotification = shouldShowBrowserNotification(isOwnMessage)

      if (shouldShowNotification && joinedId) {
        const targetUrl = joinedId === GLOBAL_ROOM_ID ? `/chat/${GLOBAL_ROOM_SLUG}` : `/chat/${joinedId}`
        const notificationTitle =
          joinedId === GLOBAL_ROOM_ID
            ? `Новое сообщение в общем чате от ${normalized.username}`
            : `Новое сообщение от ${normalized.username}`

        void showChatNotification({
          title: notificationTitle,
          body: normalized.content,
          targetUrl,
          tag: `room-${joinedId}`,
        })
      }

      setTypingUsers((prev) => {
        const next = new Map(prev)
        if (normalized.senderId) {
          next.delete(normalized.senderId)
        }
        return next
      })

      setMessages((prev) => [...prev, normalized])
      dispatchChatUnreadChangedEvent()
    }
    socket.on("newMessage", onNewMessage)

    const onMessageDeleted = (payload: MessageDeletedSocketEvent) => {
      const deletedMessageId = payload?.messageId
      const deletedRoomId = payload?.roomId
      const joinedId = joinedRoomRef.current

      if (!deletedMessageId || !deletedRoomId || !joinedId || deletedRoomId !== joinedId) {
        return
      }

      messageIdsRef.current.delete(deletedMessageId)

      setMessages((prev) =>
        prev
          .filter((messageItem) => messageItem.id !== deletedMessageId)
          .map((messageItem) =>
            messageItem.replyTo?.id === deletedMessageId
              ? {
                ...messageItem,
                replyTo: undefined,
              }
              : messageItem,
          ),
      )

      setReplyToMessage((prev) => (prev?.id === deletedMessageId ? null : prev))
      dispatchChatUnreadChangedEvent()
    }
    socket.on("messageDeleted", onMessageDeleted)

    const onDeleteMessageResult = (payload: DeleteMessageResultSocketEvent) => {
      if (!payload || payload.ok !== false || !payload.error) {
        return
      }

      window.alert(payload.error)
    }
    socket.on("deleteMessageResult", onDeleteMessageResult)

    const onRoomHistory = ({ roomId: historyRoomId, messages: history }: RoomHistoryPayload) => {
      if (historyRoomId !== joinedRoomRef.current) {
        return
      }

      awaitingRoomHistoryRef.current = false

      const { uniqueHistory, nextMessageIds } = normalizeRoomHistory(history, user?.username)

      messageIdsRef.current = nextMessageIds

      const lastMessage = uniqueHistory[uniqueHistory.length - 1]
      if (historyRoomId && lastMessage?.content?.trim()) {
        persistLastSentPreview(historyRoomId, lastMessage.content.trim())
      }

      setMessages(uniqueHistory)
      setIsHistoryLoading(false)
    }
    socket.on("roomHistory", onRoomHistory)

    const onMyRooms = ({ rooms }: { rooms: MyRoomItem[] }) => {
      availableRoomIdsRef.current = new Set(rooms.map((room) => room.id))

      const rr = routeRoomIdRef.current
      const uid = user?.id

      const shareRoom =
        uid ? rooms.find((room) => room.title === `${SHARE_WITH_JESUS_ROOM_PREFIX}${uid}`) : undefined

      if (shareRoom && (rr === SHARE_WITH_JESUS_SLUG || rr === shareRoom.id)) {
        setResolvedShareJesusRoomId(shareRoom.id)
        setRoomRawTitle(shareRoom.title)
        setRoomTitle(SHARE_WITH_JESUS_CHAT_TITLE)
      }

      let roomForRoute: MyRoomItem | undefined
      if (rr === GLOBAL_ROOM_SLUG || rr === GLOBAL_ROOM_ID) {
        roomForRoute = rooms.find((room) => room.id === GLOBAL_ROOM_ID)
      } else if (rr === SHARE_WITH_JESUS_SLUG) {
        roomForRoute = shareRoom
      } else if (rr) {
        roomForRoute = rooms.find((room) => room.id === rr)
      }

      if (roomForRoute?.title && rr !== SHARE_WITH_JESUS_SLUG && rr !== shareRoom?.id) {
        setRoomRawTitle(roomForRoute.title)
        setRoomTitle(getReadableRoomTitle(roomForRoute.id, roomForRoute.title, uid, usersRef.current))
      }

      const routeCandidate = rr
      if (!roomForRoute && routeCandidate) {
        const isGlobal = routeCandidate === GLOBAL_ROOM_ID || routeCandidate === GLOBAL_ROOM_SLUG
        const isSelfRoute = routeCandidate === uid
        const isShareSlug = routeCandidate === SHARE_WITH_JESUS_SLUG
        const alreadyOpening = openingDirectRoomRef.current.has(routeCandidate)

        if (!isGlobal && !isSelfRoute && !isShareSlug && !alreadyOpening) {
          openingDirectRoomRef.current.add(routeCandidate)
          socket.emit("openDirectRoom", { targetUserId: routeCandidate })
        }
      }

      if (roomForRoute) {
        const isShareTitle = Boolean(roomForRoute.title?.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX))
        if (rr === SHARE_WITH_JESUS_SLUG && isShareTitle) {
          joinRoom(socket, roomForRoute.id, { skipLoadingSpinner: true })
        } else if (rr !== SHARE_WITH_JESUS_SLUG) {
          joinRoom(socket, roomForRoute.id, isShareTitle ? { skipLoadingSpinner: true } : undefined)
        }
      }
    }
    socket.on("myRooms", onMyRooms)

    const onDirectRoomOpened = (payload: DirectRoomOpenedPayload) => {
      openingDirectRoomRef.current.delete(payload.targetUserId)

      if (currentRoomRef.current === payload.targetUserId) {
        const nextRoomId = payload.roomId === GLOBAL_ROOM_ID ? GLOBAL_ROOM_SLUG : payload.roomId
        router.replace(`/chat/${nextRoomId}`)
        return
      }

      if (payload.targetUsername) {
        setRoomTitle(`Чат с ${payload.targetUsername}`)
        setRoomRawTitle(payload.title ?? "")
      } else if (payload.title) {
        setRoomRawTitle(payload.title)
        setRoomTitle(getReadableRoomTitle(payload.roomId, payload.title, user?.id, usersRef.current))
      }
    }
    socket.on("directRoomOpened", onDirectRoomOpened)

    const onOnlineCount = (count: number) => {
      if (typeof count === "number") {
        setOnlineCount((prev) => (prev === count ? prev : count))
      }
    }
    socket.on("onlineCount", onOnlineCount)

    const onOnlineUsers = (payload: OnlineUsersPayload) => {
      const nextUserIds = Array.isArray(payload?.userIds) ? payload.userIds : []
      const nextUserIdsSet = new Set(nextUserIds)
      setOnlineUserIds((prev) => (areSetsEqual(prev, nextUserIdsSet) ? prev : nextUserIdsSet))

      if (typeof payload?.count === "number") {
        const nextCount = payload.count
        setOnlineCount((prev) => (prev === nextCount ? prev : nextCount))
      }
    }
    socket.on("onlineUsers", onOnlineUsers)

    const onUserPresenceChanged = (payload: UserPresencePayload) => {
      if (!payload?.userId) return

      setOnlineUserIds((prev) => {
        const alreadyOnline = prev.has(payload.userId)
        if (alreadyOnline === payload.isOnline) {
          return prev
        }

        const next = new Set(prev)
        if (payload.isOnline) {
          next.add(payload.userId)
        } else {
          next.delete(payload.userId)
        }
        return next
      })
    }
    socket.on("userPresenceChanged", onUserPresenceChanged)

    const onUserTyping = (payload: {
      roomId?: string
      userId?: string
      username?: string
      isTyping?: boolean
    }) => {
      const joinedId = joinedRoomRef.current
      if (!joinedId || payload.roomId !== joinedId) return
      if (!payload.userId || payload.userId === userIdRef.current) return

      setTypingUsers((prev) => {
        const next = new Map(prev)
        const uid = payload.userId
        if (!uid) return prev
        if (payload.isTyping && payload.username) {
          next.set(uid, payload.username)
        } else {
          next.delete(uid)
        }
        return next
      })
    }
    socket.on("userTyping", onUserTyping)

    const onInvitedToRoom = () => {
      socket.emit("getMyRooms")
    }
    socket.on("userInvitedToRoom", onInvitedToRoom)

    return () => {
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      socket.off("connect_error", onSocketError)
      socket.off("error", onSocketError)
      socket.off("newMessage", onNewMessage)
      socket.off("messageDeleted", onMessageDeleted)
      socket.off("deleteMessageResult", onDeleteMessageResult)
      socket.off("roomHistory", onRoomHistory)
      socket.off("myRooms", onMyRooms)
      socket.off("directRoomOpened", onDirectRoomOpened)
      socket.off("userInvitedToRoom", onInvitedToRoom)
      socket.off("onlineCount", onOnlineCount)
      socket.off("onlineUsers", onOnlineUsers)
      socket.off("userPresenceChanged", onUserPresenceChanged)
      socket.off("userTyping", onUserTyping)
      leaveCurrentRoom(socket)
      socket.disconnect()
      socketRef.current = null
    }
  }, [joinRoom, leaveCurrentRoom, loading, router, user])

  const prevRouteForSocketRef = useRef<string | undefined>(undefined)

  // Синхронизируем socket-room при смене URL (используем routeRoomId: slug «share-with-jesus», global, uuid).
  useEffect(() => {
    if (loading || !routeRoomId) return

    const socket = socketRef.current
    if (!socket?.connected) return

    const prev = prevRouteForSocketRef.current
    prevRouteForSocketRef.current = routeRoomId

    if (prev && prev !== routeRoomId && joinedRoomRef.current) {
      leaveCurrentRoom(socket)
    }

    if (routeRoomId === GLOBAL_ROOM_SLUG) {
      joinRoom(socket, GLOBAL_ROOM_ID)
      return
    }

    if (routeRoomId === SHARE_WITH_JESUS_SLUG) {
      socket.emit("resolveShareWithJesusRoomId")
      return
    }

    if (availableRoomIdsRef.current.has(routeRoomId)) {
      joinRoom(socket, routeRoomId)
      return
    }

    socket.emit("getMyRooms")
  }, [routeRoomId, loading, joinRoom, leaveCurrentRoom])

  // Быстрое подключение «Поделись с Иисусом» без ожидания `myRooms`.
  useEffect(() => {
    if (loading || routeRoomId !== SHARE_WITH_JESUS_SLUG) return

    const socket = socketRef.current
    if (!socket) return

    const onResolved = (payload: ShareWithJesusRoomIdResolvedPayload) => {
      if (!payload?.ok || !payload.roomId) {
        if (payload?.error) {
          window.alert(payload.error)
        }
        return
      }

      if (!user?.id) return

      setResolvedShareJesusRoomId(payload.roomId)
      setRoomRawTitle(payload.roomTitle ?? `${SHARE_WITH_JESUS_ROOM_PREFIX}${user.id}`)
      setRoomTitle(SHARE_WITH_JESUS_CHAT_TITLE)
      joinRoom(socket, payload.roomId, { skipLoadingSpinner: true })
    }

    socket.on("shareWithJesusRoomIdResolved", onResolved)
    return () => {
      socket.off("shareWithJesusRoomIdResolved", onResolved)
    }
  }, [routeRoomId, loading, joinRoom, user?.id])

  useEffect(() => {
    if (isHistoryLoading || authError) {
      return
    }

    // Как только история загрузилась или прилетело новое сообщение,
    // и пользователь реально смотрит комнату, помечаем ее прочитанной.
    markRoomAsRead()
  }, [messages.length, isHistoryLoading, authError, markRoomAsRead])

  useEffect(() => {
    const handleFocus = () => {
      markRoomAsRead()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        markRoomAsRead()
      }
    }

    window.addEventListener("focus", handleFocus)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("focus", handleFocus)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [markRoomAsRead])

  const isShareWithJesusView =
    routeRoomId === SHARE_WITH_JESUS_SLUG || roomRawTitle.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)

  const shareJesusParchmentBanner = isShareWithJesusView ? (
    <div className={styles.shareJesusParchment}>
      <span className={styles.shareJesusParchmentEdge} aria-hidden />
      <p className={styles.shareJesusParchmentTitle}>{SHARE_JESUS_PARCHMENT_TITLE}</p>
      <p className={styles.shareJesusParchmentText}>{SHARE_JESUS_PARCHMENT_TEXT}</p>
    </div>
  ) : null

  const resolvedTitle = roomTitle || getReadableRoomTitle(roomId, undefined, user?.id, users)
  const routeUser = useMemo(() => users.find((existingUser) => existingUser.id === roomId), [users, roomId])
  const directRoomUserIdFromTitle = useMemo(() => {
    if (!roomRawTitle.startsWith("dm:")) {
      return undefined
    }

    return roomRawTitle
      .split(":")
      .slice(1)
      .find((id) => id !== user?.id)
  }, [roomRawTitle, user?.id])

  const directChatTargetUserId = routeUser?.id ?? directRoomUserIdFromTitle
  const directChatTargetUser = useMemo(
    () => users.find((existingUser) => existingUser.id === directChatTargetUserId),
    [users, directChatTargetUserId],
  )
  const headerAvatarSrc = useMemo(() => {
    if (isShareWithJesusView) {
      return "/jesus-say.svg"
    }
    if (roomId === GLOBAL_ROOM_ID) {
      return "/ava-chat.jpeg"
    }
    return resolvePublicAvatarUrl(directChatTargetUser?.avatarUrl)
  }, [directChatTargetUser?.avatarUrl, isShareWithJesusView, roomId])

  const headerAvatarClassName =
    headerAvatarSrc != null && headerAvatarSrc !== ""
      ? isShareWithJesusView
        ? `${styles.avatar} ${styles.avatarJesus}`
        : `${styles.avatar} ${styles.avatarWithPhoto}`
      : styles.avatar

  const isDirectTargetOnline = Boolean(directChatTargetUserId && onlineUserIds.has(directChatTargetUserId))
  const globalOnlineCount = onlineCount

  const statusLine =
    isHistoryLoading
      ? "Загрузка сообщений..."
      : !isSocketConnected
        ? "Подключение..."
        : roomId === GLOBAL_ROOM_ID
          ? `${globalOnlineCount} пользователей онлайн`
          : routeRoomId === SHARE_WITH_JESUS_SLUG || roomRawTitle.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)
            ? "Личное место для заметок"
            : directChatTargetUser
              ? isDirectTargetOnline
                ? "онлайн"
                : "не в сети"
              : ""

  const headerPresenceClass =
    directChatTargetUser != null
      ? isDirectTargetOnline
        ? styles.peerOnline
        : styles.peerOffline
      : styles.peerNeutral

  /** Зелёный цвет строки «N пользователей онлайн» в общем чате (не для «Загрузка…» / «Подключение…»). */
  const globalOnlineStatusHighlight =
    roomId === GLOBAL_ROOM_ID && !isHistoryLoading && isSocketConnected

  const typingUsernames = useMemo(() => Array.from(typingUsers.values()), [typingUsers])

  const handleReplyMessage = (message: Message) => {
    if (isMessageFromCurrentUser(message, user)) {
      return
    }

    setReplyToMessage(message)
  }

  const handleDeleteOwnMessage = useCallback(
    (message: Message) => {
      if (!effectiveSocketRoomId) {
        return
      }

      const socket = socketRef.current
      if (!socket || !socket.connected) {
        window.alert("Нет соединения с сервером. Попробуйте позже.")
        return
      }

      if (!isMessageFromCurrentUser(message, user)) {
        return
      }

      const isGlobal = effectiveSocketRoomId === GLOBAL_ROOM_ID
      const confirmed = window.confirm(
        isGlobal ? "Удалить это сообщение из общего чата?" : "Удалить это сообщение?",
      )
      if (!confirmed) {
        return
      }

      socket.emit("deleteMessage", { messageId: message.id })
    },
    [effectiveSocketRoomId, user],
  )

  const handleOpenDmFromAvatar = useCallback(
    (message: Message) => {
      if (!message.senderId || message.senderId === user?.id) {
        return
      }

      const socket = socketRef.current
      if (socket?.connected) {
        socket.emit("openDirectRoom", { targetUserId: message.senderId })
      }
      router.push(`/chat/${message.senderId}`)
    },
    [router, user?.id],
  )

  async function handleSend(text: string, replyTarget?: Message | null) {
    const targetRoomId = effectiveSocketRoomId
    if (!socketRef.current || !targetRoomId || !text.trim()) return false

    if (!socketRef.current.connected) {
      setSendNotice("Сообщение не отправлено — ждём подключения к серверу.")
      return false
    }

    if (routeRoomId === user?.id) return false

    if (routeRoomId === SHARE_WITH_JESUS_SLUG && !resolvedShareJesusRoomId) {
      socketRef.current.emit("getMyRooms")
      return false
    }

    if (!availableRoomIdsRef.current.has(targetRoomId) && targetRoomId !== GLOBAL_ROOM_ID) {
      if (routeRoomId && !openingDirectRoomRef.current.has(routeRoomId)) {
        openingDirectRoomRef.current.add(routeRoomId)
        socketRef.current.emit("openDirectRoom", { targetUserId: routeRoomId })
      }
      return false
    }

    const normalizedText = text.trim()
    setSendNotice(null)
    persistLastSentPreview(targetRoomId, normalizedText, directChatTargetUserId)

    const serializedContent = serializeMessageWithReply(
      normalizedText,
      replyTarget
        ? {
          id: replyTarget.id,
          username: replyTarget.username,
          content: replyTarget.content,
        }
        : null,
    )

    socketRef.current.emit("sendMessage", { roomId: targetRoomId, content: serializedContent })
    return true
  }

  return (
    <section className={`${styles.chat} container`}>
      <div className={styles.header}>
        <div
          className={`${styles.headerContent} ${headerPresenceClass} ${globalOnlineStatusHighlight ? styles.globalOnlineStatus : ""}`}
        >
          <Link href="/chat">
            <Image className={styles.backIcon} src="/back-icon.svg" alt="Back" width={24} height={24} />
          </Link>
          <div className={headerAvatarClassName}>
            {headerAvatarSrc ? (
              <Image
                src={headerAvatarSrc}
                alt=""
                width={40}
                height={40}
                className={styles.avatarPhoto}
                unoptimized
              />
            ) : (
              getInitials(resolvedTitle)
            )}
          </div>
          <div className={styles.wrapContent}>
            <h2 className={styles.chatName}>{resolvedTitle}</h2>
            {statusLine ? <span className={styles.status}>{statusLine}</span> : null}
          </div>
        </div>
      </div>

      {authError ? (
        <p className={styles.stateMessage}>{authError}</p>
      ) : isHistoryLoading ? (
        <div className={styles.messagesSkeleton}>
          <CrossLoader label="Загрузка сообщений" variant="inline" />
        </div>
      ) : (
        <ChatWindow
          messages={messages}
          currentUsername={user?.username}
          currentUser={user}
          withSenderAvatars
          resolveAvatarUrl={(senderId) =>
            resolvePublicAvatarUrl(users.find((existingUser) => existingUser.id === senderId)?.avatarUrl)
          }
          onAvatarClick={handleOpenDmFromAvatar}
          onReplyMessage={handleReplyMessage}
          onDeleteMessage={handleDeleteOwnMessage}
          canDeleteOwnMessages={Boolean(effectiveSocketRoomId)}
          topBanner={shareJesusParchmentBanner}
          typingUsernames={typingUsernames}
        />
      )}

      <MessageInput
        onSend={handleSend}
        replyToMessage={replyToMessage}
        onCancelReply={() => setReplyToMessage(null)}
        disabled={routeRoomId === SHARE_WITH_JESUS_SLUG && !resolvedShareJesusRoomId}
        placeholder={
          routeRoomId === SHARE_WITH_JESUS_SLUG && !resolvedShareJesusRoomId
            ? "Подключаем комнату…"
            : "Напиши сообщение…"
        }
        onTypingActivity={isSocketConnected && !authError ? handleTypingActivity : undefined}
      />
      {sendNotice ? <p className={styles.sendNotice}>{sendNotice}</p> : null}
    </section>
  )
}
