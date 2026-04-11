import { parseVoiceMessageUrl } from "@/lib/voiceMessage"
import { parseStickerMessagePayload } from "@/lib/stickerMessage"
import { parseVerseSharePayload } from "@/lib/verseShareMessage"
import { scripturePlainText } from "@/lib/sanitizeScriptureHtml"

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
  if (parseStickerMessagePayload(t)) {
    return "Стикер"
  }
  if (parseVoiceMessageUrl(t)) {
    return "Голосовое сообщение"
  }
  const verseShare = parseVerseSharePayload(t)
  if (verseShare.payload) {
    return scripturePlainText(verseShare.payload.text) || t
  }
  return m.content ?? ""
}
