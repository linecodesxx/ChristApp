import { parseVoiceMessageUrl } from "@/lib/voiceMessage"

export type ChatMessagePreviewInput = {
  content: string
  type?: string
  fileUrl?: string | null
}

/** Текст превью для списка чатов, уведомлений и ответов. */
export function chatMessagePreview(m: ChatMessagePreviewInput): string {
  if (m.type === "FILE") {
    return "Файл"
  }
  const url = m.fileUrl?.trim()
  if (m.type === "IMAGE" || Boolean(url)) {
    return "Фото"
  }
  const t = (m.content ?? "").trim()
  if (parseVoiceMessageUrl(t)) {
    return "Голосовое сообщение"
  }
  return m.content ?? ""
}
