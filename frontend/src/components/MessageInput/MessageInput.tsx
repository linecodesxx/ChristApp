"use client"

import { useEffect, useRef, useState } from "react"
import styles from "@/components/MessageInput/MessageInput.module.scss"
import Image from "next/image"
import type { Message } from "@/types/message"

type MessageInputProps = {
  onSend: (text: string, replyToMessage?: Message | null) => Promise<boolean>
  replyToMessage?: Message | null
  onCancelReply?: () => void
}

const MAX_MESSAGE_LENGTH = 2000
const MAX_TEXTAREA_HEIGHT = 140

export default function MessageInput({ onSend, replyToMessage, onCancelReply }: MessageInputProps) {
  const [value, setValue] = useState("")
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const hasText = value.trim().length > 0

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [value])

  const submit = async () => {
    const text = value.trim()
    if (!text || isSending) return

    setIsSending(true)
    try {
      const isSent = await onSend(text, replyToMessage)
      if (isSent) {
        setValue("")
        onCancelReply?.()
      }
    } finally {
      setIsSending(false)
    }
  }

  const replyText = replyToMessage?.content.replace(/\s+/g, " ").trim() ?? ""

  return (
    <div className={styles.messageComposer}>
      {replyToMessage ? (
        <div className={styles.replyingTo}>
          <div className={styles.replyingToMeta}>
            <span className={styles.replyingToLabel}>Ответ на {replyToMessage.username}</span>
            <span className={styles.replyingToText}>{replyText}</span>
          </div>
          <button
            type="button"
            className={styles.replyingToClose}
            aria-label="Отменить ответ"
            onClick={onCancelReply}
          >
            ×
          </button>
        </div>
      ) : null}

      <div className={styles.message}>
        <button type="button" className={styles.iconButton} aria-label="Прикрепить" title="Скоро доступно" disabled>
          <Image src="/icon-attachment.svg" alt="Add" width={20} height={20} className={styles.attachmentButton} />
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void submit()
            }
          }}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Напиши сообщение..."
          className={styles.input}
          aria-label="Сообщение"
        />

        <button
          type="button"
          className={styles.iconButton}
          aria-label="Отправить сообщение"
          onClick={() => void submit()}
          disabled={!hasText || isSending}
        >
          <Image src="/icon-send.svg" className={styles.sendButton} alt="Send" width={18} height={18} />
        </button>
      </div>
    </div>
  )
}
