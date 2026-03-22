"use client"

import { useTabBarOverlayOptional } from "@/contexts/TabBarOverlayContext"
import { useEffect, useRef, useState } from "react"
import styles from "@/components/MessageInput/MessageInput.module.scss"
import Image from "next/image"
import type { Message } from "@/types/message"

type MessageInputProps = {
  onSend: (text: string, replyToMessage?: Message | null) => Promise<boolean>
  replyToMessage?: Message | null
  onCancelReply?: () => void
  disabled?: boolean
  placeholder?: string
  /** Сигнал для индикатора «печатает» (debounce внутри). */
  onTypingActivity?: (isActivelyTyping: boolean) => void
}

const MAX_MESSAGE_LENGTH = 2000
const MAX_TEXTAREA_HEIGHT = 140

export default function MessageInput({
  onSend,
  replyToMessage,
  onCancelReply,
  disabled = false,
  placeholder = "Напиши сообщение...",
  onTypingActivity,
}: MessageInputProps) {
  const tabBarOverlay = useTabBarOverlayOptional()
  const tabBarOverlayRef = useRef(tabBarOverlay)
  tabBarOverlayRef.current = tabBarOverlay
  const [value, setValue] = useState("")
  const [isSending, setIsSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const typingSentRef = useRef(false)
  const onTypingActivityRef = useRef(onTypingActivity)
  onTypingActivityRef.current = onTypingActivity
  const hasText = value.trim().length > 0

  useEffect(() => {
    return () => {
      if (typingSentRef.current) {
        typingSentRef.current = false
        onTypingActivityRef.current?.(false)
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      tabBarOverlayRef.current?.setChatComposerFocused(false)
    }
  }, [])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [value])

  useEffect(() => {
    if (!onTypingActivity || disabled) {
      return
    }

    if (!value.trim()) {
      if (typingSentRef.current) {
        typingSentRef.current = false
        onTypingActivity(false)
      }
      return
    }

    if (!typingSentRef.current) {
      typingSentRef.current = true
      onTypingActivity(true)
    }

    const idleTimer = window.setTimeout(() => {
      typingSentRef.current = false
      onTypingActivity(false)
    }, 2200)

    return () => window.clearTimeout(idleTimer)
  }, [value, onTypingActivity, disabled])

  const submit = async () => {
    const text = value.trim()
    if (!text || isSending || disabled) return

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
          onFocus={() => tabBarOverlayRef.current?.setChatComposerFocused(true)}
          onBlur={() => tabBarOverlayRef.current?.setChatComposerFocused(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void submit()
            }
          }}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={placeholder}
          className={styles.input}
          aria-label="Сообщение"
          disabled={disabled}
        />

        <button
          type="button"
          className={styles.iconButton}
          aria-label="Отправить сообщение"
          onClick={() => void submit()}
          disabled={disabled || !hasText || isSending}
        >
          <Image src="/icon-send.svg" className={styles.sendButton} alt="Send" width={18} height={18} />
        </button>
      </div>
    </div>
  )
}
