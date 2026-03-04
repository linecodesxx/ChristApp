export type MessageReply = {
  id: string
  username: string
  content: string
}

export type Message = {
  sender?: string
  id: string
  username: string
  content: string
  createdAt: string
  replyTo?: MessageReply
}
