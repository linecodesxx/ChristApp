// Все типы, связанные с чатами и сокетами

export type IncomingSocketMessage = {
  id?: string | number
  roomId?: string
  content?: string
  createdAt?: string | Date
  username?: string
  sender?: {
    username?: string
  }
}

export type MyRoomItem = {
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

export type DirectRoomOpenedPayload = {
  roomId: string
  targetUserId: string
  title?: string
  targetUsername?: string
}

export type RoomHistoryPayload = {
  roomId: string
  messages: IncomingSocketMessage[]
}

export type OnlineUsersPayload = {
  userIds: string[]
  count?: number
}

export type UserPresencePayload = {
  userId: string
  isOnline: boolean
}

export type MessageDeletedSocketEvent = {
  messageId?: string
  roomId?: string
}

export type DeleteMessageResultSocketEvent = {
  ok?: boolean
  messageId?: string
  roomId?: string
  error?: string
}
