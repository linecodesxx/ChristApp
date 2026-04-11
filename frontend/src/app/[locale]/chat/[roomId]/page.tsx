"use client"

import ChatWindow from "@/components/ChatWindow/ChatWindow"
import styles from "./chatRoom.module.scss"
import MessageInput from "@/components/MessageInput/MessageInput"
import { isMessageFromCurrentUser, type AppReactionType, type Message, type MessageReply } from "@/types/message"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { io, type Socket } from "socket.io-client"
import { useParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "@/i18n/navigation"
import { getInitials } from "@/lib/utils"
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl"
import { useAuth } from "@/hooks/useAuth"
import { getAuthToken } from "@/lib/auth"
import { apiFetch } from "@/lib/apiFetch"
import { dispatchChatUnreadChangedEvent } from "@/lib/chatUnreadEvents"
import { showChatNotification } from "@/lib/notifications"
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback"
import { Link } from "@/i18n/navigation"
import Image from "next/image"
import { GLOBAL_ROOM_ID, GLOBAL_ROOM_SLUG, SHARE_WITH_JESUS_ROOM_PREFIX, SHARE_WITH_JESUS_SLUG } from "@/lib/chatRooms"
import { chatMessagePreview } from "@/lib/chatMessagePreview"
import { buildStickerMessagePayload } from "@/lib/stickerMessage"
import { type StickerItem } from "@/components/StickerPicker/StickerPicker"
import { fetchRoomMessagesOrThrow } from "@/lib/chatMessagesApi"
import { chatRoomHistoryQueryKey } from "@/lib/chatQueryKeys"
import { chatMyRoomsQueryKey } from "@/lib/chatRoomsQuery"
import { getDirectApiOrigin, getHttpApiBase } from "@/lib/apiBase"
import OnlineUsersDrawer from "@/components/OnlineUsersDrawer/OnlineUsersDrawer"
import {
  avatarLikesForUserQueryKey,
  avatarLikesMeQueryKey,
  fetchAvatarLikesForUser,
  toggleAvatarLikeForUser,
} from "@/lib/queries/avatarLikesQueries"

const CHAT_SOCKET_URL = getDirectApiOrigin()
const CHAT_HTTP_API = getHttpApiBase()
const HISTORY_PAGE_SIZE = 250
const LAST_SENT_PREVIEW_STORAGE_KEY = "chat:last-sent-previews"
const REPLY_META_PREFIX = "[[reply:"
const REPLY_META_SUFFIX = "]]"
const MAX_REPLY_PREVIEW_LENGTH = 180
const MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024
const ALLOWED_IMAGE_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
type IncomingSocketMessage = {
  id?: string | number
  roomId?: string
  content?: string
  type?: string
  fileUrl?: string
  createdAt?: string | Date
  username?: string
  handle?: string
  senderId?: string
  sender?: {
    id?: string
    username?: string
    nickname?: string
  }
  reactions?: Array<{
    id?: string
    userId?: string
    type?: string
    createdAt?: string | Date
  }>
}

type MyRoomItem = {
  id: string
  title: string
  createdAt: string
  directPeer?: {
    id: string
    username: string
    nickname?: string | null
    avatarUrl?: string | null
  }
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
  lastSeenAt?: string | null
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

type UpdateMessageReactionsPayload = {
  messageId?: string
  reactions?: Array<{
    id?: string
    userId?: string
    type?: string
    createdAt?: string | Date
  }>
}

type RoomReadStatesPayload = {
  roomId?: string
  readStates?: Array<{
    userId?: string
    lastReadAt?: string | Date
  }>
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

  const replySnippet =
    chatMessagePreview({
      content: replyTo.content,
      type: replyTo.type,
      fileUrl: replyTo.fileUrl,
    }) || replyTo.content

  const safeReply: MessageReply = {
    id: String(replyTo.id),
    username: (String(replyTo.username || "Unknown").trim() || "Unknown").slice(0, 60),
    content: normalizeReplyContent(String(replySnippet || "")),
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

function normalizeIncomingMessage(raw: IncomingSocketMessage | null | undefined, currentUsername?: string): Message {
  const senderId = raw?.senderId ?? raw?.sender?.id
  const handle = raw?.handle ?? raw?.sender?.username
  const displayName = raw?.username ?? raw?.sender?.nickname ?? raw?.sender?.username ?? "Unknown"
  const rawContent = String(raw?.content ?? "")
  const { content, replyTo } = parseMessageWithReply(rawContent)
  const type =
    raw?.type === "TEXT" || raw?.type === "VOICE" || raw?.type === "IMAGE" || raw?.type === "FILE"
      ? raw.type
      : undefined
  const fileUrl = raw?.fileUrl?.trim() ? raw.fileUrl.trim() : undefined
  const reactions = (raw?.reactions ?? [])
    .map((reaction) => {
      if (!reaction?.id || !reaction.userId) return null
      if (
        reaction.type !== "🤍" &&
        reaction.type !== "😂" &&
        reaction.type !== "❤️" &&
        reaction.type !== "🔥" &&
        reaction.type !== "🥰" &&
        reaction.type !== "😧" &&
        reaction.type !== "🥲"
      ) {
        return null
      }
      return {
        id: String(reaction.id),
        userId: String(reaction.userId),
        type: reaction.type as AppReactionType,
        createdAt: String(reaction.createdAt ?? new Date().toISOString()),
      }
    })
    .filter(Boolean) as Message["reactions"]

  const legacyMe =
    Boolean(currentUsername) &&
    !senderId &&
    !handle &&
    (displayName === currentUsername || raw?.sender?.username === currentUsername)

  return {
    id: String(raw?.id ?? Date.now()),
    content,
    type,
    fileUrl,
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
    username: displayName,
    handle,
    senderId,
    sender: legacyMe || handle === currentUsername ? "me" : undefined,
    replyTo,
    reactions,
  }
}

type ChatRoomTitleLabels = {
  globalChatTitle: string
  shareWithJesusTitle: string
  directChatWith: (name: string) => string
  chatFallback: string
}

function getReadableRoomTitle(
  roomId: string | undefined,
  rawTitle: string | undefined,
  currentUserId: string | undefined,
  users: Array<{ id: string; username: string; nickname?: string }> | undefined,
  directPeer: { username: string; nickname?: string | null } | null | undefined,
  labels: ChatRoomTitleLabels,
) {
  if (roomId === GLOBAL_ROOM_ID) {
    return labels.globalChatTitle
  }

  if (rawTitle?.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)) {
    return labels.shareWithJesusTitle
  }

  if (!rawTitle?.trim()) {
    return directPeer
      ? labels.directChatWith(directPeer.nickname ?? directPeer.username)
      : labels.chatFallback
  }

  if (rawTitle.startsWith("dm:")) {
    const directIds = rawTitle.split(":").slice(1)
    const otherUserId = directIds.find((id) => id !== currentUserId)
    const otherUser = users?.find((existingUser) => existingUser.id === otherUserId)
    if (otherUser) {
      return labels.directChatWith(otherUser.nickname ?? otherUser.username)
    }
    if (directPeer) {
      return labels.directChatWith(directPeer.nickname ?? directPeer.username)
    }
    return labels.chatFallback
  }

  return rawTitle
}

function findDirectRoomByUserId(rooms: MyRoomItem[], currentUserId: string | undefined, targetUserId: string) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    return undefined
  }
  const [idA, idB] = [currentUserId, targetUserId].sort()
  const dmTitle = `dm:${idA}:${idB}`
  return rooms.find((room) => room.title === dmTitle)
}

export default function ChatPageDetails() {
  const t = useTranslations("chat")
  const locale = useLocale()
  const { user, users, loading } = useAuth({ redirectIfUnauthenticated: "/" })
  const queryClient = useQueryClient()
  // Runtime refs нужны для socket callbacks, чтобы избежать stale state внутри listeners.
  const socketRef = useRef<Socket | null>(null)
  const usersRef = useRef(users)
  const currentRoomRef = useRef<string | undefined>(undefined)
  const joinedRoomRef = useRef<string | undefined>(undefined)
  const availableRoomIdsRef = useRef<Set<string>>(new Set())
  const openingDirectRoomRef = useRef<Set<string>>(new Set())
  const messageIdsRef = useRef<Set<string>>(new Set())
  const lastMyRoomsEmitAtRef = useRef(0)
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
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  const [isParticipantsDrawerOpen, setIsParticipantsDrawerOpen] = useState(false)
  const [onlineCount, setOnlineCount] = useState(0)
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())
  const [lastSeenByUserId, setLastSeenByUserId] = useState<Map<string, string>>(() => new Map())
  const [nowTs, setNowTs] = useState(() => Date.now())
  const [typingUsers, setTypingUsers] = useState<Map<string, { username: string; activity: "text" | "voice" }>>(
    () => new Map(),
  )
  const [peerLastReadAt, setPeerLastReadAt] = useState<string | null>(null)
  const [roomReadStatesByUserId, setRoomReadStatesByUserId] = useState<Map<string, string>>(() => new Map())
  const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false)
  const [isUserProfileOpen, setIsUserProfileOpen] = useState(false)
  const userIdRef = useRef<string | undefined>(undefined)
  const typingTextEmitRef = useRef(false)
  const typingVoiceEmitRef = useRef(false)

  const titleLabels = useMemo(
    (): ChatRoomTitleLabels => ({
      globalChatTitle: t("globalChatTitle"),
      shareWithJesusTitle: t("shareWithJesusTitle"),
      directChatWith: (name: string) => t("directChatWith", { name }),
      chatFallback: t("chatFallback"),
    }),
    [t],
  )
  const titleLabelsRef = useRef(titleLabels)
  useEffect(() => {
    titleLabelsRef.current = titleLabels
  }, [titleLabels])

  const roomI18nRef = useRef({
    noAuthToken: t("noAuthToken"),
    noTokenOrRoom: t("noTokenOrRoom"),
    notificationGlobal: (sender: string) => t("notificationGlobal", { sender }),
    notificationDirect: (name: string) => t("notificationDirect", { name }),
  })
  useEffect(() => {
    roomI18nRef.current = {
      noAuthToken: t("noAuthToken"),
      noTokenOrRoom: t("noTokenOrRoom"),
      notificationGlobal: (sender: string) => t("notificationGlobal", { sender }),
      notificationDirect: (name: string) => t("notificationDirect", { name }),
    }
  }, [t])

  const requestMyRooms = useCallback((targetSocket: { emit: (event: string) => void } | null | undefined) => {
    if (!targetSocket) return
    const now = Date.now()
    if (now - lastMyRoomsEmitAtRef.current < 350) {
      return
    }
    lastMyRoomsEmitAtRef.current = now
    targetSocket.emit("getMyRooms")
  }, [])

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
  const [directRouteRoomId, setDirectRouteRoomId] = useState<string | null>(null)
  const routeRoomIdRef = useRef(routeRoomId)
  useEffect(() => {
    routeRoomIdRef.current = routeRoomId
  }, [routeRoomId])
  useEffect(() => {
    setDirectRouteRoomId(null)
  }, [routeRoomId])

  useEffect(() => {
    document.body.classList.add("chatRoomPage")
    return () => document.body.classList.remove("chatRoomPage")
  }, [])

  const effectiveSocketRoomId = useMemo(() => {
    if (!routeRoomId) return null
    if (routeRoomId === GLOBAL_ROOM_SLUG) return GLOBAL_ROOM_ID
    if (routeRoomId === SHARE_WITH_JESUS_SLUG) return resolvedShareJesusRoomId
    return directRouteRoomId ?? routeRoomId
  }, [directRouteRoomId, routeRoomId, resolvedShareJesusRoomId])

  const roomHistoryQuery = useQuery({
    queryKey: chatRoomHistoryQueryKey(effectiveSocketRoomId),
    enabled: Boolean(user?.id && effectiveSocketRoomId),
    /** Иначе глобальный placeholderData подставляет историю предыдущей комнаты при смене чата. */
    placeholderData: undefined,
    queryFn: async () => {
      const token = getAuthToken()
      if (!token || !effectiveSocketRoomId) {
        throw new Error(t("noTokenOrRoom"))
      }
      return fetchRoomMessagesOrThrow({
        token,
        roomId: effectiveSocketRoomId,
        limit: HISTORY_PAGE_SIZE,
        skip: 0,
      })
    },
    staleTime: 20_000,
  })

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
    if (typingTextEmitRef.current === active) return
    typingTextEmitRef.current = active
    socket.emit("roomTyping", { roomId: joinedId, isTyping: active, activity: "text" })
  }, [])

  const handleVoiceRecordingActivity = useCallback((active: boolean) => {
    const socket = socketRef.current
    const joinedId = joinedRoomRef.current
    if (!socket?.connected || !joinedId) return
    if (typingVoiceEmitRef.current === active) return
    typingVoiceEmitRef.current = active
    socket.emit("roomTyping", { roomId: joinedId, isTyping: active, activity: "voice" })
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

    if (typingTextEmitRef.current) {
      typingTextEmitRef.current = false
      socket.emit("roomTyping", { roomId: joinedRoomId, isTyping: false, activity: "text" })
    }
    if (typingVoiceEmitRef.current) {
      typingVoiceEmitRef.current = false
      socket.emit("roomTyping", { roomId: joinedRoomId, isTyping: false, activity: "voice" })
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
    setEditingMessage(null)
    setResolvedShareJesusRoomId(null)
    if (routeRoomId === SHARE_WITH_JESUS_SLUG && user) {
      setRoomTitle(t("shareWithJesusTitle"))
      setRoomRawTitle(`${SHARE_WITH_JESUS_ROOM_PREFIX}${user.id}`)
      setIsHistoryLoading(false)
    } else {
      setRoomTitle("")
      setRoomRawTitle("")
      setIsHistoryLoading(true)
    }
  }, [roomId, routeRoomId, t, user])

  useEffect(() => {
    if (!roomHistoryQuery.data || !effectiveSocketRoomId) {
      return
    }
    if (roomHistoryQuery.isPlaceholderData) {
      return
    }

    const { uniqueHistory, nextMessageIds } = normalizeRoomHistory(
      roomHistoryQuery.data as IncomingSocketMessage[],
      user?.username,
    )

    messageIdsRef.current = nextMessageIds
    setMessages(uniqueHistory)
    setIsHistoryLoading(false)
    awaitingRoomHistoryRef.current = false
  }, [effectiveSocketRoomId, roomHistoryQuery.data, roomHistoryQuery.isPlaceholderData, user?.username])

  useEffect(() => {
    setTypingUsers(new Map())
    typingTextEmitRef.current = false
    typingVoiceEmitRef.current = false
    setPeerLastReadAt(null)
    setLastSeenByUserId(new Map())
    setRoomReadStatesByUserId(new Map())
    setIsAvatarPreviewOpen(false)
    setIsUserProfileOpen(false)
  }, [roomId, routeRoomId, effectiveSocketRoomId])

  useEffect(() => {
    const tickId = window.setInterval(() => {
      setNowTs(Date.now())
    }, 1000)
    return () => window.clearInterval(tickId)
  }, [])

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
      setAuthError(roomI18nRef.current.noAuthToken)
      setIsHistoryLoading(false)
      return
    }

    const socket = io(CHAT_SOCKET_URL, {
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

      const cachedRooms = queryClient.getQueryData<MyRoomItem[]>(chatMyRoomsQueryKey(user?.id))
      if (cachedRooms?.length && rr && rr !== GLOBAL_ROOM_SLUG && rr !== SHARE_WITH_JESUS_SLUG) {
        const directRoom = findDirectRoomByUserId(cachedRooms, user?.id, rr)
        if (directRoom) {
          joinRoom(socket, directRoom.id)
          setRoomRawTitle(directRoom.title)
          setRoomTitle(
            getReadableRoomTitle(
              directRoom.id,
              directRoom.title,
              user?.id,
              usersRef.current,
              directRoom.directPeer,
              titleLabelsRef.current,
            ),
          )
        }
      }

      requestMyRooms(socket)
    }
    socket.on("connect", onConnect)

    const onDisconnect = () => {
      setIsSocketConnected(false)
      setIsHistoryLoading((prev) => awaitingRoomHistoryRef.current || prev)
      setOnlineCount(0)
      setOnlineUserIds(new Set())
      setLastSeenByUserId(new Map())
      setRoomReadStatesByUserId(new Map())
      setTypingUsers(new Map())
      typingTextEmitRef.current = false
      typingVoiceEmitRef.current = false
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
      const previewLine = chatMessagePreview({
        content: normalized.content,
        type: normalized.type,
        fileUrl: normalized.fileUrl,
      })
      if (!previewLine.trim()) {
        return
      }

      if (messageIdsRef.current.has(normalized.id)) {
        return
      }

      messageIdsRef.current.add(normalized.id)

      if (joinedId && previewLine.trim()) {
        persistLastSentPreview(joinedId, previewLine)
      }

      const isOwnMessage = isMessageFromCurrentUser(normalized, user)
      const shouldShowNotification = shouldShowBrowserNotification(isOwnMessage)

      if (shouldShowNotification && joinedId) {
        const targetUrl = joinedId === GLOBAL_ROOM_ID ? `/chat/${GLOBAL_ROOM_SLUG}` : `/chat/${joinedId}`
        const i18n = roomI18nRef.current
        const notificationTitle =
          joinedId === GLOBAL_ROOM_ID
            ? i18n.notificationGlobal(normalized.username)
            : i18n.notificationDirect(normalized.username)

        void showChatNotification({
          title: notificationTitle,
          body: previewLine,
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
      setEditingMessage((prev) => (prev?.id === deletedMessageId ? null : prev))
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
      if (historyRoomId && lastMessage) {
        const historyPreview = chatMessagePreview({
          content: lastMessage.content,
          type: lastMessage.type,
          fileUrl: lastMessage.fileUrl,
        })
        if (historyPreview.trim()) {
          persistLastSentPreview(historyRoomId, historyPreview)
        }
      }

      setMessages(uniqueHistory)
      setIsHistoryLoading(false)
      void queryClient.setQueryData(chatRoomHistoryQueryKey(historyRoomId), history)
    }
    socket.on("roomHistory", onRoomHistory)

    const onMyRooms = ({ rooms }: { rooms: MyRoomItem[] }) => {
      queryClient.setQueryData(chatMyRoomsQueryKey(user?.id), rooms)
      availableRoomIdsRef.current = new Set(rooms.map((room) => room.id))

      const rr = routeRoomIdRef.current
      const uid = user?.id

      const shareRoom = uid ? rooms.find((room) => room.title === `${SHARE_WITH_JESUS_ROOM_PREFIX}${uid}`) : undefined

      if (shareRoom && (rr === SHARE_WITH_JESUS_SLUG || rr === shareRoom.id)) {
        setResolvedShareJesusRoomId(shareRoom.id)
        setRoomRawTitle(shareRoom.title)
        setRoomTitle(titleLabelsRef.current.shareWithJesusTitle)
      }

      let roomForRoute: MyRoomItem | undefined
      if (rr === GLOBAL_ROOM_SLUG || rr === GLOBAL_ROOM_ID) {
        roomForRoute = rooms.find((room) => room.id === GLOBAL_ROOM_ID)
      } else if (rr === SHARE_WITH_JESUS_SLUG) {
        roomForRoute = shareRoom
      } else if (rr) {
        roomForRoute = rooms.find((room) => room.id === rr)
        if (!roomForRoute) {
          roomForRoute = findDirectRoomByUserId(rooms, uid, rr)
        }
      }

      if (roomForRoute?.title && rr !== SHARE_WITH_JESUS_SLUG && rr !== shareRoom?.id) {
        setRoomRawTitle(roomForRoute.title)
        setRoomTitle(
          getReadableRoomTitle(
            roomForRoute.id,
            roomForRoute.title,
            uid,
            usersRef.current,
            roomForRoute.directPeer,
            titleLabelsRef.current,
          ),
        )
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
        if (rr !== GLOBAL_ROOM_SLUG && rr !== GLOBAL_ROOM_ID && rr !== SHARE_WITH_JESUS_SLUG) {
          setDirectRouteRoomId(roomForRoute.id)
        }
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
      setDirectRouteRoomId(payload.roomId)
      joinRoom(socket, payload.roomId)

      if (payload.targetUsername) {
        setRoomTitle(titleLabelsRef.current.directChatWith(payload.targetUsername))
        setRoomRawTitle(payload.title ?? "")
      } else if (payload.title) {
        setRoomRawTitle(payload.title)
        setRoomTitle(
          getReadableRoomTitle(
            payload.roomId,
            payload.title,
            user?.id,
            usersRef.current,
            undefined,
            titleLabelsRef.current,
          ),
        )
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

      if (!payload.isOnline && payload.lastSeenAt) {
        setLastSeenByUserId((prev) => {
          const next = new Map(prev)
          next.set(payload.userId, payload.lastSeenAt as string)
          return next
        })
      }
    }
    socket.on("userPresenceChanged", onUserPresenceChanged)

    const onUserTyping = (payload: {
      roomId?: string
      userId?: string
      username?: string
      isTyping?: boolean
      activity?: "text" | "voice"
    }) => {
      const joinedId = joinedRoomRef.current
      if (!joinedId || payload.roomId !== joinedId) return
      if (!payload.userId || payload.userId === userIdRef.current) return

      setTypingUsers((prev) => {
        const next = new Map(prev)
        const uid = payload.userId
        if (!uid) return prev
        if (payload.isTyping && payload.username) {
          next.set(uid, {
            username: payload.username,
            activity: payload.activity === "voice" ? "voice" : "text",
          })
        } else {
          next.delete(uid)
        }
        return next
      })
    }
    socket.on("userTyping", onUserTyping)

    const onUserJoinedRoom = (payload: { roomId?: string; userId?: string }) => {
      const joinedId = joinedRoomRef.current
      if (!joinedId || payload.roomId !== joinedId) return
      if (!payload.userId || payload.userId === userIdRef.current) return
      setPeerLastReadAt(new Date().toISOString())
      setRoomReadStatesByUserId((prev) => {
        const next = new Map(prev)
        next.set(payload.userId as string, new Date().toISOString())
        return next
      })
    }
    socket.on("userJoinedRoom", onUserJoinedRoom)

    const onRoomReadUpdated = (payload: { roomId?: string; userId?: string; lastReadAt?: string }) => {
      const joinedId = joinedRoomRef.current
      if (!joinedId || payload.roomId !== joinedId) return
      if (!payload.userId || payload.userId === userIdRef.current) return
      if (!payload.lastReadAt) return
      const nextLastReadAt = payload.lastReadAt
      setRoomReadStatesByUserId((prev) => {
        const next = new Map(prev)
        const current = next.get(payload.userId as string)
        if (!current || new Date(nextLastReadAt).getTime() >= new Date(current).getTime()) {
          next.set(payload.userId as string, nextLastReadAt)
        }
        return next
      })
      setPeerLastReadAt((prev) => {
        if (!prev) return nextLastReadAt
        return new Date(nextLastReadAt).getTime() >= new Date(prev).getTime() ? nextLastReadAt : prev
      })
    }
    socket.on("roomReadUpdated", onRoomReadUpdated)

    const onRoomReadStates = (payload: RoomReadStatesPayload) => {
      const joinedId = joinedRoomRef.current
      if (!joinedId || payload.roomId !== joinedId) return

      const next = new Map<string, string>()
      for (const item of payload.readStates ?? []) {
        if (!item?.userId || !item?.lastReadAt) continue
        next.set(String(item.userId), String(item.lastReadAt))
      }
      setRoomReadStatesByUserId(next)
    }
    socket.on("roomReadStates", onRoomReadStates)

    const onUpdateMessageReactions = (payload: UpdateMessageReactionsPayload) => {
      const joinedId = joinedRoomRef.current
      if (!joinedId || !payload?.messageId) return
      const normalizedReactions = (payload.reactions ?? [])
        .map((reaction) => {
          if (!reaction?.id || !reaction.userId) return null
          if (
            reaction.type !== "🤍" &&
            reaction.type !== "😂" &&
            reaction.type !== "❤️" &&
            reaction.type !== "🔥" &&
            reaction.type !== "😊" &&
            reaction.type !== "😧" &&
            reaction.type !== "🥲"
          ) {
            return null
          }
          return {
            id: String(reaction.id),
            userId: String(reaction.userId),
            type: reaction.type as AppReactionType,
            createdAt: String(reaction.createdAt ?? new Date().toISOString()),
          }
        })
        .filter(Boolean) as NonNullable<Message["reactions"]>

      setMessages((prev) =>
        prev.map((messageItem) =>
          messageItem.id === payload.messageId
            ? {
                ...messageItem,
                reactions: normalizedReactions,
              }
            : messageItem,
        ),
      )
    }
    socket.on("update-message-reactions", onUpdateMessageReactions)

    const onInvitedToRoom = () => {
      requestMyRooms(socket)
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
      socket.off("userJoinedRoom", onUserJoinedRoom)
      socket.off("roomReadUpdated", onRoomReadUpdated)
      socket.off("roomReadStates", onRoomReadStates)
      socket.off("update-message-reactions", onUpdateMessageReactions)
      leaveCurrentRoom(socket)
      socket.disconnect()
      socketRef.current = null
    }
  }, [joinRoom, leaveCurrentRoom, loading, queryClient, requestMyRooms, router, user])

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

    const cachedRooms = queryClient.getQueryData<MyRoomItem[]>(chatMyRoomsQueryKey(user?.id))
    if (cachedRooms?.length && user?.id) {
      const directRoom = findDirectRoomByUserId(cachedRooms, user.id, routeRoomId)
      if (directRoom) {
        joinRoom(socket, directRoom.id)
        setRoomRawTitle(directRoom.title)
        setRoomTitle(
          getReadableRoomTitle(
            directRoom.id,
            directRoom.title,
            user.id,
            usersRef.current,
            directRoom.directPeer,
            titleLabelsRef.current,
          ),
        )
        return
      }
    }

    requestMyRooms(socket)
  }, [queryClient, requestMyRooms, routeRoomId, loading, joinRoom, leaveCurrentRoom, user?.id])

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
      setRoomTitle(titleLabelsRef.current.shareWithJesusTitle)
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
      <p className={styles.shareJesusParchmentTitle}>{t("parchmentTitle")}</p>
      <p className={styles.shareJesusParchmentText}>{t("parchmentText")}</p>
    </div>
  ) : null

  const resolvedTitle =
    roomTitle ||
    getReadableRoomTitle(roomId, undefined, user?.id, users, undefined, titleLabels)
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

  useEffect(() => {
    if (roomId === GLOBAL_ROOM_ID) {
      setRoomTitle(titleLabels.globalChatTitle)
      return
    }
    if (routeRoomId === SHARE_WITH_JESUS_SLUG || roomRawTitle.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)) {
      setRoomTitle(titleLabels.shareWithJesusTitle)
      return
    }
    if (roomRawTitle.trim()) {
      const peer =
        directChatTargetUser != null
          ? {
              username: directChatTargetUser.username,
              nickname: directChatTargetUser.nickname ?? null,
            }
          : undefined
      setRoomTitle(getReadableRoomTitle(roomId, roomRawTitle, user?.id, users, peer, titleLabels))
    }
  }, [directChatTargetUser, roomId, roomRawTitle, routeRoomId, titleLabels, user?.id, users])

  const usersById = useMemo(() => {
    const map = new Map<string, (typeof users)[number]>()
    for (const item of users) {
      map.set(item.id, item)
    }
    return map
  }, [users])

  const participants = useMemo(() => {
    const list: Array<(typeof users)[number]> = []
    if (roomId === GLOBAL_ROOM_ID) {
      return users.map((item) => ({
        ...item,
        isOnline: onlineUserIds.has(item.id),
      }))
    }

    if (user) {
      list.push(user)
    }
    if (directChatTargetUser && !list.some((item) => item.id === directChatTargetUser.id)) {
      list.push(directChatTargetUser)
    }

    return list.map((item) => ({
      ...item,
      isOnline: onlineUserIds.has(item.id),
    }))
  }, [directChatTargetUser, onlineUserIds, roomId, user, users])
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
  const canOpenAvatarPreview =
    Boolean(directChatTargetUserId) &&
    Boolean(headerAvatarSrc) &&
    roomId !== GLOBAL_ROOM_ID &&
    !isShareWithJesusView
  const canOpenDirectUserProfile = Boolean(directChatTargetUser) && roomId !== GLOBAL_ROOM_ID && !isShareWithJesusView

  const avatarLikesQueryEnabled =
    Boolean(directChatTargetUserId) &&
    roomId !== GLOBAL_ROOM_ID &&
    !isShareWithJesusView &&
    Boolean(getAuthToken())

  const { data: peerAvatarLikes } = useQuery({
    queryKey: avatarLikesForUserQueryKey(directChatTargetUserId ?? ""),
    queryFn: () => fetchAvatarLikesForUser(directChatTargetUserId!),
    enabled: avatarLikesQueryEnabled,
  })

  const isPeerSelf = Boolean(user?.id && directChatTargetUserId === user.id)
  const avatarLikeCount = peerAvatarLikes?.receivedCount ?? 0
  const isAvatarLiked = peerAvatarLikes?.likedByMe ?? false

  const toggleAvatarLikeMutation = useMutation({
    mutationFn: async () => {
      if (!directChatTargetUserId) {
        throw new Error("no peer")
      }
      return toggleAvatarLikeForUser(directChatTargetUserId)
    },
    onSuccess: () => {
      if (directChatTargetUserId) {
        void queryClient.invalidateQueries({ queryKey: avatarLikesForUserQueryKey(directChatTargetUserId) })
      }
      void queryClient.invalidateQueries({ queryKey: avatarLikesMeQueryKey })
    },
  })

  const handleToggleAvatarLike = useCallback(() => {
    if (!directChatTargetUserId || isPeerSelf) {
      return
    }
    toggleAvatarLikeMutation.mutate()
  }, [directChatTargetUserId, isPeerSelf, toggleAvatarLikeMutation])

  const directChatTargetJoinedAt = useMemo(() => {
    const createdAt = directChatTargetUser?.createdAt
    if (!createdAt) {
      return null
    }

    const joinedAt = new Date(createdAt)
    if (Number.isNaN(joinedAt.getTime())) {
      return null
    }

    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(joinedAt)
  }, [directChatTargetUser?.createdAt, locale])

  const directChatTargetDaysInApp = useMemo(() => {
    const createdAt = directChatTargetUser?.createdAt
    if (!createdAt) {
      return null
    }

    const joinedAtTs = new Date(createdAt).getTime()
    if (Number.isNaN(joinedAtTs)) {
      return null
    }

    const daysInApp = Math.max(1, Math.floor((Date.now() - joinedAtTs) / (1000 * 60 * 60 * 24)) + 1)
    return t("profileDaysInApp", { count: daysInApp })
  }, [directChatTargetUser?.createdAt, t])

  const isDirectTargetOnline = Boolean(directChatTargetUserId && onlineUserIds.has(directChatTargetUserId))
  const globalOnlineCount = onlineCount
  const directTargetLastSeenAt = directChatTargetUserId ? lastSeenByUserId.get(directChatTargetUserId) : undefined
  const voiceRecordingStatusLine = (() => {
    for (const value of typingUsers.values()) {
      if (value.activity === "voice") {
        return t("recordingVoice", { name: value.username })
      }
    }
    return null
  })()

  const formatLastSeenAgo = (lastSeenIso: string | undefined) => {
    if (!lastSeenIso) {
      return t("offline")
    }
    const diffMs = Math.max(0, nowTs - new Date(lastSeenIso).getTime())
    const sec = Math.floor(diffMs / 1000)
    if (sec < 60) {
      return t("lastSeenSeconds", { count: sec })
    }
    const min = Math.floor(sec / 60)
    if (min < 60) {
      return t("lastSeenMinutes", { count: min })
    }
    const hours = Math.floor(min / 60)
    return t("lastSeenHours", { count: hours })
  }

  const statusLine = isHistoryLoading
    ? t("loadingMessages")
    : !isSocketConnected
      ? t("connecting")
      : voiceRecordingStatusLine
        ? voiceRecordingStatusLine
        : roomId === GLOBAL_ROOM_ID
          ? t("usersOnlineCount", { count: globalOnlineCount })
          : routeRoomId === SHARE_WITH_JESUS_SLUG || roomRawTitle.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)
            ? t("shareJesusNotesHint")
            : directChatTargetUser
              ? isDirectTargetOnline
                ? t("onlineShort")
                : formatLastSeenAgo(directTargetLastSeenAt)
              : ""

  const headerPresenceClass =
    directChatTargetUser != null ? (isDirectTargetOnline ? styles.peerOnline : styles.peerOffline) : styles.peerNeutral

  /** Зелёный цвет строки «N пользователей онлайн» в общем чате (не для «Загрузка…» / «Подключение…»). */
  const globalOnlineStatusHighlight = roomId === GLOBAL_ROOM_ID && !isHistoryLoading && isSocketConnected

  const typingStatuses = useMemo(() => Array.from(typingUsers.values()), [typingUsers])

  const readReceiptMessageId = useMemo(() => {
    const isEligibleDirectChat =
      Boolean(directChatTargetUserId) && effectiveSocketRoomId !== GLOBAL_ROOM_ID && !isShareWithJesusView
    if (!peerLastReadAt || !user || !isEligibleDirectChat) {
      return null
    }
    const readTs = new Date(peerLastReadAt).getTime()
    let lastOwnReadMessageId: string | null = null
    for (const messageItem of messages) {
      const isOwn = isMessageFromCurrentUser(messageItem, user)
      if (!isOwn) continue
      const messageTs = new Date(messageItem.createdAt).getTime()
      if (messageTs <= readTs) {
        lastOwnReadMessageId = messageItem.id
      }
    }
    return lastOwnReadMessageId
  }, [messages, peerLastReadAt, user, directChatTargetUserId, effectiveSocketRoomId, isShareWithJesusView])

  const readReceiptUsersByMessageId = useMemo(() => {
    if (!user || roomId !== GLOBAL_ROOM_ID) {
      return new Map<string, Array<{ id: string; avatarSrc?: string; label?: string }>>()
    }

    const otherParticipants = participants.filter((participant) => participant.id !== user.id)
    const result = new Map<string, Array<{ id: string; avatarSrc?: string; label?: string }>>()

    for (const messageItem of messages) {
      if (!isMessageFromCurrentUser(messageItem, user)) continue

      const messageTs = new Date(messageItem.createdAt).getTime()
      const readers = otherParticipants
        .filter((participant) => {
          const lastReadAt = roomReadStatesByUserId.get(participant.id)
          if (!lastReadAt) return false
          return new Date(lastReadAt).getTime() >= messageTs
        })
        .map((participant) => ({
          id: participant.id,
          avatarSrc: resolvePublicAvatarUrl(participant.avatarUrl),
          label: participant.nickname ?? participant.username,
        }))

      if (readers.length > 0) {
        result.set(messageItem.id, readers)
      }
    }

    return result
  }, [messages, participants, roomId, roomReadStatesByUserId, user])

  const handleReplyMessage = (message: Message) => {
    setReplyToMessage(message)
    setEditingMessage(null)
  }

  const handleMissingReferencedMessage = useCallback(() => {
    setSendNotice(t("replyOriginalMissing"))
  }, [t])

  const handleStartEditMessage = useCallback(
    (message: Message) => {
      if (!isMessageFromCurrentUser(message, user)) return
      if (message.type && message.type !== "TEXT") return
      setEditingMessage(message)
      setReplyToMessage(null)
    },
    [user],
  )

  const handleSaveEditedMessage = useCallback(async (messageId: string, text: string) => {
    const nextContent = text.trim()
    if (!nextContent) return false
    setMessages((prev) =>
      prev.map((messageItem) =>
        messageItem.id === messageId
          ? {
              ...messageItem,
              content: nextContent,
              isEdited: true,
            }
          : messageItem,
      ),
    )
    setEditingMessage(null)
    return true
  }, [])

  const handleDeleteOwnMessage = useCallback(
    (message: Message) => {
      if (!effectiveSocketRoomId) {
        return
      }

      const socket = socketRef.current
      if (!socket || !socket.connected) {
        window.alert(t("serverUnreachable"))
        return
      }

      if (!isMessageFromCurrentUser(message, user)) {
        return
      }

      const isGlobal = effectiveSocketRoomId === GLOBAL_ROOM_ID
      const confirmed = window.confirm(isGlobal ? t("deleteMessageGlobalConfirm") : t("deleteMessageConfirm"))
      if (!confirmed) {
        return
      }

      socket.emit("deleteMessage", { messageId: message.id })
    },
    [effectiveSocketRoomId, t, user],
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

  const handleParticipantClick = useCallback(
    (participant: { id: string }) => {
      if (!participant?.id || participant.id === user?.id) {
        return
      }
      const socket = socketRef.current
      if (socket?.connected) {
        socket.emit("openDirectRoom", { targetUserId: participant.id })
      }
      setIsParticipantsDrawerOpen(false)
      router.push(`/chat/${participant.id}`)
    },
    [router, user?.id],
  )

  const handleToggleReaction = useCallback(
    (message: Message, reaction: AppReactionType) => {
      const targetRoomId = effectiveSocketRoomId
      const socket = socketRef.current
      if (!socket || !socket.connected || !targetRoomId) {
        return
      }
      socket.emit("toggle-reaction", {
        messageId: message.id,
        type: reaction,
        chatId: targetRoomId,
      })
    },
    [effectiveSocketRoomId],
  )

  async function handleSend(text: string, replyTarget?: Message | null) {
    const targetRoomId = effectiveSocketRoomId
    if (!socketRef.current || !targetRoomId || !text.trim()) return false

    if (!socketRef.current.connected) {
      setSendNotice(t("sendWaitConnection"))
      return false
    }

    if (routeRoomId === user?.id) return false

    if (routeRoomId === SHARE_WITH_JESUS_SLUG && !resolvedShareJesusRoomId) {
      requestMyRooms(socketRef.current)
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
            type: replyTarget.type,
            fileUrl: replyTarget.fileUrl,
          }
        : null,
    )

    socketRef.current.emit("sendMessage", { roomId: targetRoomId, content: serializedContent })
    return true
  }

  const handleSendVoice = useCallback(
    async (audioBlob: Blob): Promise<boolean> => {
      const targetRoomId = effectiveSocketRoomId
      if (!targetRoomId || !audioBlob?.size) {
        return false
      }

      if (routeRoomId === user?.id) {
        return false
      }

      if (routeRoomId === SHARE_WITH_JESUS_SLUG && !resolvedShareJesusRoomId) {
        setSendNotice(t("roomConnecting"))
        return false
      }

      if (!availableRoomIdsRef.current.has(targetRoomId) && targetRoomId !== GLOBAL_ROOM_ID) {
        if (routeRoomId && !openingDirectRoomRef.current.has(routeRoomId)) {
          openingDirectRoomRef.current.add(routeRoomId)
          socketRef.current?.emit("openDirectRoom", { targetUserId: routeRoomId })
        }
        setSendNotice(t("roomNotReady"))
        return false
      }

      const token = getAuthToken()
      if (!token) {
        setSendNotice(t("noAuthTokenNotice"))
        return false
      }

      const formData = new FormData()
      const file = new File([audioBlob], "voice.webm", {
        type: audioBlob.type || "audio/webm",
      })
      formData.append("file", file)
      formData.append("roomId", targetRoomId)

      setSendNotice(null)
      try {
        const response = await apiFetch(`${CHAT_HTTP_API}/messages/voice`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })

        if (!response.ok) {
          const text = (await response.text()).trim()
          setSendNotice(text.slice(0, 280) || t("httpError", { status: response.status }))
          return false
        }
        return true
      } catch {
        setSendNotice(t("voiceSendFailed"))
        return false
      }
    },
    [effectiveSocketRoomId, resolvedShareJesusRoomId, routeRoomId, t, user?.id],
  )

  const handleSendImage = useCallback(
    async (imageFile: File): Promise<boolean> => {
      const targetRoomId = effectiveSocketRoomId
      if (!targetRoomId || !imageFile?.size) {
        return false
      }

      if (routeRoomId === user?.id) {
        return false
      }

      if (routeRoomId === SHARE_WITH_JESUS_SLUG && !resolvedShareJesusRoomId) {
        setSendNotice(t("roomConnecting"))
        return false
      }

      if (!availableRoomIdsRef.current.has(targetRoomId) && targetRoomId !== GLOBAL_ROOM_ID) {
        if (routeRoomId && !openingDirectRoomRef.current.has(routeRoomId)) {
          openingDirectRoomRef.current.add(routeRoomId)
          socketRef.current?.emit("openDirectRoom", { targetUserId: routeRoomId })
        }
        setSendNotice(t("roomNotReady"))
        return false
      }

      const token = getAuthToken()
      if (!token) {
        setSendNotice(t("noAuthTokenNotice"))
        return false
      }

      const formData = new FormData()
      formData.append("file", imageFile)
      formData.append("roomId", targetRoomId)

      setSendNotice(null)
      try {
        const response = await apiFetch(`${CHAT_HTTP_API}/messages/image`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })

        if (!response.ok) {
          const text = (await response.text()).trim()
          setSendNotice(text.slice(0, 280) || t("httpError", { status: response.status }))
          return false
        }
        return true
      } catch {
        setSendNotice(t("imageSendFailed"))
        return false
      }
    },
    [effectiveSocketRoomId, resolvedShareJesusRoomId, routeRoomId, t, user?.id],
  )

  const handleSelectAttachments = useCallback(
    async (files: File[]) => {
      if (!files.length) return

      const tooLarge = files.find((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES)
      if (tooLarge) {
        setSendNotice(t("fileTooLarge", { name: tooLarge.name }))
        return
      }

      let sentImages = 0
      const unsupportedNames: string[] = []

      for (const file of files) {
        const mimeType = file.type.toLowerCase()
        if (ALLOWED_IMAGE_ATTACHMENT_TYPES.has(mimeType)) {
          const sent = await handleSendImage(file)
          if (sent) {
            sentImages += 1
          }
          continue
        }
        unsupportedNames.push(file.name)
      }

      if (unsupportedNames.length > 0) {
        const unsupportedPreview = unsupportedNames.slice(0, 2).join(", ")
        const restCount = unsupportedNames.length - 2
        setSendNotice(
          t("imagesOnly", {
            list: unsupportedPreview,
            more: restCount > 0 ? t("imagesOnlyMore", { count: restCount }) : "",
          }),
        )
        return
      }

      if (sentImages > 0) {
        setSendNotice(null)
      }
    },
    [handleSendImage, t],
  )

  const handleSendSticker = useCallback(
    async (sticker: StickerItem): Promise<boolean> => {
      const targetRoomId = effectiveSocketRoomId
      const socket = socketRef.current
      if (!socket || !targetRoomId) {
        return false
      }
      if (!socket.connected) {
        setSendNotice(t("stickerWaitConnection"))
        return false
      }
      if (routeRoomId === user?.id) {
        return false
      }
      if (routeRoomId === SHARE_WITH_JESUS_SLUG && !resolvedShareJesusRoomId) {
        requestMyRooms(socket)
        return false
      }
      if (!availableRoomIdsRef.current.has(targetRoomId) && targetRoomId !== GLOBAL_ROOM_ID) {
        if (routeRoomId && !openingDirectRoomRef.current.has(routeRoomId)) {
          openingDirectRoomRef.current.add(routeRoomId)
          socket.emit("openDirectRoom", { targetUserId: routeRoomId })
        }
        return false
      }

      const payload = buildStickerMessagePayload(sticker.id, sticker.path)
      setSendNotice(null)
      persistLastSentPreview(targetRoomId, t("stickerLabel"), directChatTargetUserId)
      socket.emit("sendMessage", { roomId: targetRoomId, content: payload })
      return true
    },
    [directChatTargetUserId, effectiveSocketRoomId, requestMyRooms, resolvedShareJesusRoomId, routeRoomId, t, user?.id],
  )

  const skeletonRows = [
    { side: "left", width: "wide" },
    { side: "right", width: "medium" },
    { side: "left", width: "narrow" },
    { side: "right", width: "wide" },
    { side: "left", width: "medium" },
    { side: "right", width: "narrow" },
    { side: "left", width: "wide" },
    { side: "right", width: "medium" },
    { side: "left", width: "narrow" },
    { side: "right", width: "wide" },
    { side: "left", width: "medium" },
    { side: "right", width: "narrow" },
    { side: "left", width: "wide" },
    { side: "right", width: "medium" },
  ] as const

  return (
    <section className={`${styles.chat} container`}>
      <div className={styles.header}>
        <div
          className={`${styles.headerContent} ${headerPresenceClass} ${globalOnlineStatusHighlight ? styles.globalOnlineStatus : ""}`}
        >
          <Link href="/chat">
            <Image className={styles.backIcon} src="/back-icon.svg" alt={t("backAlt")} width={24} height={24} />
          </Link>
          {canOpenAvatarPreview ? (
            <button
              type="button"
              className={`${headerAvatarClassName} ${styles.headerAvatarButton}`}
              onClick={() => setIsAvatarPreviewOpen(true)}
              aria-label="Открыть аватар"
            >
              <AvatarWithFallback
                src={headerAvatarSrc}
                initials={getInitials(resolvedTitle)}
                colorSeed={directChatTargetUser?.id ?? roomId ?? resolvedTitle}
                width={40}
                height={40}
                imageClassName={styles.avatarPhoto}
                fallbackClassName={styles.avatarLetterFallback}
                loading="eager"
                fallbackTint="onError"
              />
            </button>
          ) : (
            <div className={headerAvatarClassName}>
              <AvatarWithFallback
                src={headerAvatarSrc}
                initials={getInitials(resolvedTitle)}
                colorSeed={directChatTargetUser?.id ?? roomId ?? resolvedTitle}
                width={40}
                height={40}
                imageClassName={styles.avatarPhoto}
                fallbackClassName={styles.avatarLetterFallback}
                loading="eager"
                fallbackTint="onError"
              />
            </div>
          )}
          <div className={styles.wrapContent}>
            <div className={styles.titleRow}>
              <h2 className={styles.chatName}>{resolvedTitle}</h2>
              {canOpenDirectUserProfile ? (
                <button
                  type="button"
                  className={styles.profileButton}
                  onClick={() => setIsUserProfileOpen(true)}
                  aria-label={t("profileButtonAria", { name: resolvedTitle })}
                  title={t("profileButton")}
                >
                  {t("profileButton")}
                </button>
              ) : null}
            </div>
            {statusLine ? <span className={styles.status}>{statusLine}</span> : null}
          </div>
          {roomId === GLOBAL_ROOM_ID ? (
            <button
              type="button"
              className={styles.participantsButton}
              onClick={() => setIsParticipantsDrawerOpen(true)}
              aria-label={t("participantsTitle")}
              title={t("participantsTitle")}
            >
              <Image
                src="/icon-profile.svg"
                alt=""
                width={18}
                height={18}
                className={styles.participantsIcon}
                aria-hidden
              />
            </button>
          ) : null}
        </div>
      </div>

      {authError ? (
        <p className={styles.stateMessage}>{authError}</p>
      ) : isHistoryLoading ? (
        <div className={styles.messagesSkeleton}>
          <div className={styles.messagesSkeletonList} aria-hidden>
            {skeletonRows.map((row, index) => (
              <div
                key={`chat-message-skeleton-${index}`}
                className={`${styles.messagesSkeletonRow} ${row.side === "left" ? styles.messagesSkeletonRowLeft : styles.messagesSkeletonRowRight}`}
              >
                <span
                  className={`${styles.messagesSkeletonBubble} ${
                    row.width === "wide"
                      ? styles.messagesSkeletonBubbleWide
                      : row.width === "medium"
                        ? styles.messagesSkeletonBubbleMedium
                        : styles.messagesSkeletonBubbleNarrow
                  }`}
                />
              </div>
            ))}
            <div className={styles.messagesSkeletonGrow} />
          </div>
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
          onMissingReferencedMessage={handleMissingReferencedMessage}
          onEditMessage={handleStartEditMessage}
          onDeleteMessage={handleDeleteOwnMessage}
          canDeleteOwnMessages={Boolean(effectiveSocketRoomId)}
          topBanner={shareJesusParchmentBanner}
          typingStatuses={typingStatuses}
          readReceiptMessageId={readReceiptMessageId}
          readReceiptUsersByMessageId={readReceiptUsersByMessageId}
          readReceiptAvatarSrc={resolvePublicAvatarUrl(directChatTargetUser?.avatarUrl)}
          readReceiptLabel={t("readReceipt")}
          onToggleReaction={handleToggleReaction}
          resolveReactionAvatarUrl={(senderId) => resolvePublicAvatarUrl(usersById.get(senderId)?.avatarUrl)}
          resolveReactionUserLabel={(senderId) =>
            usersById.get(senderId)?.nickname ?? usersById.get(senderId)?.username
          }
          roomKey={effectiveSocketRoomId ?? routeRoomId}
        />
      )}

      <div className={styles.composerDock}>
        <MessageInput
          onSend={handleSend}
          onSaveEdit={handleSaveEditedMessage}
          editingMessage={editingMessage}
          replyToMessage={replyToMessage}
          onCancelReply={() => setReplyToMessage(null)}
          onCancelEdit={() => setEditingMessage(null)}
          onSelectFiles={handleSelectAttachments}
          disabled={routeRoomId === SHARE_WITH_JESUS_SLUG && !resolvedShareJesusRoomId}
          placeholder={
            routeRoomId === SHARE_WITH_JESUS_SLUG && !resolvedShareJesusRoomId
              ? t("composerConnecting")
              : t("composerPlaceholder")
          }
          onTypingActivity={isSocketConnected && !authError ? handleTypingActivity : undefined}
          onVoiceRecordingActivity={isSocketConnected && !authError ? handleVoiceRecordingActivity : undefined}
          onSendVoice={authError || routeRoomId === user?.id ? undefined : handleSendVoice}
          onSendImage={authError || routeRoomId === user?.id ? undefined : handleSendImage}
          onSendSticker={authError || routeRoomId === user?.id ? undefined : handleSendSticker}
        />
        {sendNotice ? <p className={styles.sendNotice}>{sendNotice}</p> : null}
      </div>
      <OnlineUsersDrawer
        open={isParticipantsDrawerOpen}
        onClose={() => setIsParticipantsDrawerOpen(false)}
        participants={participants}
        title={t("participantsTitle")}
        onParticipantClick={handleParticipantClick}
      />

      {isAvatarPreviewOpen && canOpenAvatarPreview ? (
        <div className={styles.avatarPreviewOverlay} onClick={() => setIsAvatarPreviewOpen(false)}>
          <div className={styles.avatarPreviewCard} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={styles.avatarPreviewClose}
              onClick={() => setIsAvatarPreviewOpen(false)}
              aria-label="Закрыть просмотр аватара"
            >
              ×
            </button>
            <AvatarWithFallback
              src={headerAvatarSrc}
              initials={getInitials(resolvedTitle)}
              colorSeed={directChatTargetUser?.id ?? roomId ?? resolvedTitle}
              width={220}
              height={220}
              imageClassName={styles.avatarPreviewImage}
              fallbackClassName={styles.avatarPreviewFallback}
              loading="eager"
              fallbackTint="onError"
            />
            <button
              type="button"
              className={`${styles.avatarLikeButton} ${isAvatarLiked ? styles.avatarLikeButtonActive : ""}`}
              onClick={handleToggleAvatarLike}
              disabled={isPeerSelf || toggleAvatarLikeMutation.isPending}
              aria-label="Лайкнуть аватар"
              title="Лайк"
            >
              <span aria-hidden>❤</span>
              <span>{avatarLikeCount}</span>
            </button>
          </div>
        </div>
      ) : null}

      {isUserProfileOpen && canOpenDirectUserProfile ? (
        <div className={styles.avatarPreviewOverlay} onClick={() => setIsUserProfileOpen(false)}>
          <div className={styles.profilePreviewCard} onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className={styles.avatarPreviewClose}
              onClick={() => setIsUserProfileOpen(false)}
              aria-label={t("profileCloseAria")}
            >
              ×
            </button>

            <AvatarWithFallback
              src={headerAvatarSrc}
              initials={getInitials(resolvedTitle)}
              colorSeed={directChatTargetUser?.id ?? roomId ?? resolvedTitle}
              width={88}
              height={88}
              imageClassName={styles.profilePreviewAvatar}
              fallbackClassName={styles.profilePreviewAvatarFallback}
              loading="eager"
              fallbackTint="onError"
            />

            <div className={styles.profilePreviewIdentity}>
              <h3 className={styles.profilePreviewTitle}>{resolvedTitle}</h3>
              <p className={styles.profilePreviewHandle}>
                @{directChatTargetUser?.username ?? t("anonymousUser")}
              </p>
            </div>

            <div className={styles.profilePreviewFacts}>
              <div className={styles.profilePreviewFact}>
                <span className={styles.profilePreviewFactLabel}>{t("profileJoinedAt")}</span>
                <span className={styles.profilePreviewFactValue}>
                  {directChatTargetJoinedAt ?? t("profileNoData")}
                </span>
              </div>
              <div className={styles.profilePreviewFact}>
                <span className={styles.profilePreviewFactLabel}>{t("profileDaysLabel")}</span>
                <span className={styles.profilePreviewFactValue}>
                  {directChatTargetDaysInApp ?? t("profileNoData")}
                </span>
              </div>
              <div className={styles.profilePreviewFact}>
                <span className={styles.profilePreviewFactLabel}>{t("profileLastRead")}</span>
                <span className={styles.profilePreviewFactValueMuted}>{t("profileNoData")}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
