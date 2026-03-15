"use client"

import ChatWindow from "@/components/ChatWindow/ChatWindow"
import styles from "./chatRoom.module.scss"
import MessageInput from "@/components/MessageInput/MessageInput"
import type { Message, MessageReply } from "@/types/message"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"
import { useParams, useRouter } from "next/navigation"
import { getInitials } from "@/lib/utils"
import { useAuth } from "@/hooks/useAuth"
import { getAuthToken } from "@/lib/auth"
import { dispatchChatUnreadChangedEvent } from "@/lib/chatUnreadEvents"
import { showChatNotification } from "@/lib/notifications"
import Link from "next/link"
import Image from "next/image"

const WS_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
const GLOBAL_ROOM_ID = "00000000-0000-0000-0000-000000000001"
const GLOBAL_ROOM_SLUG = "global"
const SHARE_WITH_JESUS_ROOM_PREFIX = "share-with-jesus:"
const SHARE_WITH_JESUS_CHAT_TITLE = "Поделись с Иисусом"
const HISTORY_PAGE_SIZE = 250
const LAST_SENT_PREVIEW_STORAGE_KEY = "chat:last-sent-previews"
const REPLY_META_PREFIX = "[[reply:"
const REPLY_META_SUFFIX = "]]"
const MAX_REPLY_PREVIEW_LENGTH = 180
const MESSAGE_SKELETON_ITEMS = [
  { width: "68%", own: false },
  { width: "54%", own: true },
  { width: "74%", own: false },
  { width: "62%", own: true },
  { width: "58%", own: false },
  { width: "70%", own: false },
]

type IncomingSocketMessage = {
  id?: string | number
  roomId?: string
  content?: string
  createdAt?: string | Date
  username?: string
  sender?: {
    username?: string
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

function normalizeIncomingMessage(raw: IncomingSocketMessage | null | undefined, currentUsername?: string): Message {
  const username = raw?.username ?? raw?.sender?.username ?? "Unknown"
  const rawContent = String(raw?.content ?? "")
  const { content, replyTo } = parseMessageWithReply(rawContent)

  return {
    id: String(raw?.id ?? Date.now()),
    content,
    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
    username,
    sender: username === currentUsername ? "me" : undefined,
    replyTo,
  }
}

function getReadableRoomTitle(
  roomId?: string,
  rawTitle?: string,
  currentUserId?: string,
  users?: Array<{ id: string; username: string }>,
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
    return otherUser ? `Чат с ${otherUser.username}` : "Личный чат"
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
  const [messages, setMessages] = useState<Message[]>([])
  const [roomTitle, setRoomTitle] = useState<string>("")
  const [roomRawTitle, setRoomRawTitle] = useState<string>("")
  const [isSocketConnected, setIsSocketConnected] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null)
  const [onlineCount, setOnlineCount] = useState(0)
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())

  const params = useParams<{ roomId: string }>()
  const router = useRouter()
  const routeRoomId = params?.roomId
  const roomId = routeRoomId === GLOBAL_ROOM_SLUG ? GLOBAL_ROOM_ID : routeRoomId

  const markRoomAsRead = useCallback(() => {
    if (!roomId) return

    const socket = socketRef.current
    if (!socket || !socket.connected) return

    if (document.visibilityState !== "visible" || !document.hasFocus()) {
      return
    }

    socket.emit("markRoomRead", { roomId })
    dispatchChatUnreadChangedEvent()
  }, [roomId])

  const joinRoom = useCallback((socket: Socket, targetRoomId: string) => {
    if (joinedRoomRef.current === targetRoomId) {
      return
    }

    setIsHistoryLoading(true)
    socket.emit("joinRoom", { roomId: targetRoomId, limit: HISTORY_PAGE_SIZE, skip: 0 })
    joinedRoomRef.current = targetRoomId
  }, [])

  const leaveCurrentRoom = useCallback((socket: Socket) => {
    const joinedRoomId = joinedRoomRef.current
    if (!joinedRoomId) {
      return
    }

    socket.emit("leaveRoom", joinedRoomId)
    joinedRoomRef.current = undefined
  }, [])

  useEffect(() => {
    usersRef.current = users
  }, [users])

  useEffect(() => {
    setMessages([])
    messageIdsRef.current = new Set()
    setReplyToMessage(null)
    setRoomTitle("")
    setRoomRawTitle("")
    setIsHistoryLoading(true)
  }, [roomId])

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
      setConnectionError("Нет токена авторизации")
      setIsHistoryLoading(false)
      return
    }

    const socket = io(WS_URL, {
      auth: { token },
      transports: ["websocket"],
    })

    socketRef.current = socket

    const onConnect = () => {
      setIsSocketConnected(true)
      setConnectionError(null)

      const activeRoomId = currentRoomRef.current
      if (activeRoomId === GLOBAL_ROOM_ID) {
        joinRoom(socket, activeRoomId)
      }

      socket.emit("getMyRooms")
    }
    socket.on("connect", onConnect)

    const onDisconnect = () => {
      setIsSocketConnected(false)
      setConnectionError("Нет соединения с сервером. Сообщения временно недоступны.")
      setIsHistoryLoading(false)
      setOnlineCount(0)
      setOnlineUserIds(new Set())
      joinedRoomRef.current = undefined
    }
    socket.on("disconnect", onDisconnect)

    const onSocketError = () => {
      setConnectionError("Нет соединения с сервером. Проверьте интернет и попробуйте снова.")
      setIsHistoryLoading(false)
    }
    socket.on("connect_error", onSocketError)
    socket.on("error", onSocketError)

    const onNewMessage = (msg: IncomingSocketMessage) => {
      const activeRoomId = currentRoomRef.current
      if (activeRoomId && msg.roomId && msg.roomId !== activeRoomId) {
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

      if (activeRoomId && normalized.content?.trim()) {
        persistLastSentPreview(activeRoomId, normalized.content.trim())
      }

      const isOwnMessage = normalized.sender === "me" || normalized.username === user?.username
      const shouldShowNotification = shouldShowBrowserNotification(isOwnMessage)

      if (shouldShowNotification && activeRoomId) {
        const targetUrl = activeRoomId === GLOBAL_ROOM_ID ? `/chat/${GLOBAL_ROOM_SLUG}` : `/chat/${activeRoomId}`
        const notificationTitle =
          activeRoomId === GLOBAL_ROOM_ID
            ? `Новое сообщение в общем чате от ${normalized.username}`
            : `Новое сообщение от ${normalized.username}`

        void showChatNotification({
          title: notificationTitle,
          body: normalized.content,
          targetUrl,
          tag: `room-${activeRoomId}`,
        })
      }

      setMessages((prev) => [...prev, normalized])
      dispatchChatUnreadChangedEvent()
    }
    socket.on("newMessage", onNewMessage)

    const onMessageDeleted = (payload: MessageDeletedSocketEvent) => {
      const deletedMessageId = payload?.messageId
      const deletedRoomId = payload?.roomId
      const activeRoomId = currentRoomRef.current

      if (!deletedMessageId || !deletedRoomId || !activeRoomId || deletedRoomId !== activeRoomId) {
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
      const activeRoomId = currentRoomRef.current
      if (!activeRoomId || historyRoomId !== activeRoomId) {
        return
      }

      const { uniqueHistory, nextMessageIds } = normalizeRoomHistory(history, user?.username)

      messageIdsRef.current = nextMessageIds

      const lastMessage = uniqueHistory[uniqueHistory.length - 1]
      if (activeRoomId && lastMessage?.content?.trim()) {
        persistLastSentPreview(activeRoomId, lastMessage.content.trim())
      }

      setMessages(uniqueHistory)
      setIsHistoryLoading(false)
    }
    socket.on("roomHistory", onRoomHistory)

    const onMyRooms = ({ rooms }: { rooms: MyRoomItem[] }) => {
      availableRoomIdsRef.current = new Set(rooms.map((room) => room.id))

      const activeRoomId = currentRoomRef.current
      const currentRoom = rooms.find((room) => room.id === activeRoomId)

      if (!currentRoom && activeRoomId) {
        const isGlobal = activeRoomId === GLOBAL_ROOM_ID
        const isSelfRoute = activeRoomId === user?.id
        const alreadyOpening = openingDirectRoomRef.current.has(activeRoomId)

        if (!isGlobal && !isSelfRoute && !alreadyOpening) {
          openingDirectRoomRef.current.add(activeRoomId)
          socket.emit("openDirectRoom", { targetUserId: activeRoomId })
        }
      }

      if (currentRoom?.title) {
        setRoomRawTitle(currentRoom.title)
        setRoomTitle(getReadableRoomTitle(activeRoomId, currentRoom.title, user?.id, usersRef.current))
      }

      if (currentRoom && activeRoomId) {
        joinRoom(socket, activeRoomId)
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
      leaveCurrentRoom(socket)
      socket.disconnect()
      socketRef.current = null
    }
  }, [joinRoom, leaveCurrentRoom, loading, router, user?.id, user?.username])

  // Синхронизируем socket-room при смене URL комнаты.
  useEffect(() => {
    if (loading || !roomId) return

    const prevRoomId = currentRoomRef.current
    currentRoomRef.current = roomId

    const socket = socketRef.current
    if (!socket) return

    if (!socket.connected) return

    if (prevRoomId && prevRoomId !== roomId && joinedRoomRef.current === prevRoomId) {
      leaveCurrentRoom(socket)
    }

    if (roomId === GLOBAL_ROOM_ID) {
      joinRoom(socket, roomId)
      return
    }

    if (availableRoomIdsRef.current.has(roomId)) {
      joinRoom(socket, roomId)
      return
    }

    if (!availableRoomIdsRef.current.has(roomId)) {
      socket.emit("getMyRooms")
    }

    return () => {
      if (joinedRoomRef.current === roomId) {
        leaveCurrentRoom(socket)
      }
    }
  }, [joinRoom, leaveCurrentRoom, roomId, loading])

  useEffect(() => {
    if (isHistoryLoading || connectionError) {
      return
    }

    // Как только история загрузилась или прилетело новое сообщение,
    // и пользователь реально смотрит комнату, помечаем ее прочитанной.
    markRoomAsRead()
  }, [messages.length, isHistoryLoading, connectionError, markRoomAsRead])

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
  const isDirectTargetOnline = Boolean(directChatTargetUserId && onlineUserIds.has(directChatTargetUserId))
  const globalOnlineCount = onlineCount

  const roomStatusLabel = (() => {
    if (!isSocketConnected || connectionError) {
      return "Нет соединения"
    }

    if (isHistoryLoading) {
      return "Загрузка сообщений..."
    }

    if (roomId === GLOBAL_ROOM_ID) {
      return `${globalOnlineCount} пользователей онлайн`
    }

    if (roomRawTitle.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)) {
      return "Личное место для заметок"
    }

    if (directChatTargetUser) {
      return isDirectTargetOnline
        ? `${directChatTargetUser.username} онлайн`
        : `${directChatTargetUser.username} не в сети`
    }

    return "Личный чат"
  })()

  const handleReplyMessage = (message: Message) => {
    const isOwnMessage =
      message.sender === "me" ||
      (Boolean(user?.username) && message.username === user?.username) ||
      message.username === "Ты"

    if (isOwnMessage) {
      return
    }

    setReplyToMessage(message)
  }

  const handleDeleteOwnMessage = useCallback(
    (message: Message) => {
      if (roomId !== GLOBAL_ROOM_ID) {
        return
      }

      const socket = socketRef.current
      if (!socket || !socket.connected) {
        window.alert("Нет соединения с сервером. Попробуйте позже.")
        return
      }

      const isOwnMessage =
        message.sender === "me" ||
        (Boolean(user?.username) && message.username === user?.username) ||
        message.username === "Ты"

      if (!isOwnMessage) {
        return
      }

      const confirmed = window.confirm("Удалить это сообщение из общего чата?")
      if (!confirmed) {
        return
      }

      socket.emit("deleteMessage", { messageId: message.id })
    },
    [roomId, user],
  )

  async function handleSend(text: string, replyTarget?: Message | null) {
    if (!socketRef.current || !roomId || !text.trim()) return false

    if (!socketRef.current.connected) {
      setConnectionError("Нет соединения с сервером. Сообщение не отправлено.")
      return false
    }

    if (roomId === user?.id) return false

    if (!availableRoomIdsRef.current.has(roomId) && roomId !== GLOBAL_ROOM_ID) {
      if (!openingDirectRoomRef.current.has(roomId)) {
        openingDirectRoomRef.current.add(roomId)
        socketRef.current.emit("openDirectRoom", { targetUserId: roomId })
      }
      return false
    }

    const normalizedText = text.trim()
    persistLastSentPreview(roomId, normalizedText, directChatTargetUserId)

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

    socketRef.current.emit("sendMessage", { roomId, content: serializedContent })
    return true
  }

  return (
    <section className={`${styles.chat} container`}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <Link href="/chat">
            <Image className={styles.backIcon} src="/back-icon.svg" alt="Back" width={24} height={24} />
          </Link>
          <div className={styles.avatar}>{getInitials(resolvedTitle)}</div>
          <div className={styles.wrapContent}>
            <h2 className={styles.chatName}>{resolvedTitle}</h2>
            <span className={styles.status}>{roomStatusLabel}</span>
          </div>
        </div>
      </div>

      {connectionError ? (
        <p className={styles.stateMessage}>{connectionError}</p>
      ) : isHistoryLoading ? (
        <div className={styles.messagesSkeleton} aria-label="Загрузка истории сообщений" role="status">
          {MESSAGE_SKELETON_ITEMS.map((item, index) => (
            <div
              key={`skeleton-${index}`}
              className={`${styles.skeletonBubble} ${item.own ? styles.skeletonBubbleOwn : ""}`}
              style={{ width: item.width }}
            />
          ))}
        </div>
      ) : (
        <ChatWindow
          messages={messages}
          currentUsername={user?.username}
          onReplyMessage={handleReplyMessage}
          onDeleteMessage={handleDeleteOwnMessage}
          canDeleteOwnMessages={roomId === GLOBAL_ROOM_ID}
        />
      )}

      <MessageInput onSend={handleSend} replyToMessage={replyToMessage} onCancelReply={() => setReplyToMessage(null)} />
    </section>
  )
}
