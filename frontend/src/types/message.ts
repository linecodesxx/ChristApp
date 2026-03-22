export type MessageReply = {
  id: string
  username: string
  content: string
}

export type Message = {
  sender?: string
  id: string
  /** Отображаемое имя (ник). */
  username: string
  /** Уникальный @username (латиница, нижний регистр). */
  handle?: string
  senderId?: string
  content: string
  createdAt: string
  replyTo?: MessageReply
}

type ChatUser = { id: string; username: string; nickname?: string }

export function isMessageFromCurrentUser(message: Message, user: ChatUser | null | undefined): boolean {
  if (!user) return false
  if (message.sender === "me") return true
  if (message.username === "Ты") return true
  if (message.senderId && message.senderId === user.id) return true
  if (message.handle && message.handle === user.username) return true
  if (!message.senderId && !message.handle) {
    return message.username === user.username || message.username === user.nickname
  }
  return false
}
