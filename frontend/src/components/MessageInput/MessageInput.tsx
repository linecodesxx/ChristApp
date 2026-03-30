"use client"

import { useTabBarOverlayOptional } from "@/contexts/TabBarOverlayContext"
import { chatComposerTabLayoutMediaQuery, useMediaQuery } from "@/hooks/useMediaQuery"
import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { chatMessagePreview } from "@/lib/chatMessagePreview"
import styles from "@/components/MessageInput/MessageInput.module.scss"
import Image from "next/image"
import type { Message } from "@/types/message"
import VoiceInput from "@/components/VoiceInput/VoiceInput"

type ComposerMode = "text" | "voice"

type MessageInputProps = {
  onSend: (text: string, replyToMessage?: Message | null) => Promise<boolean>
  replyToMessage?: Message | null
  onCancelReply?: () => void
  disabled?: boolean
  placeholder?: string
  /** Сигнал для индикатора «печатает» (debounce внутри). */
  onTypingActivity?: (isActivelyTyping: boolean) => void
  /**
   * Голосовые сообщения: при пустом поле справа показывается микрофон (как в Telegram).
   * После успешной отправки возвращайте true.
   */
  onSendVoice?: (blob: Blob) => void | Promise<boolean>
  /** Картинка в чат (кнопка скрепки слева). */
  onSendImage?: (file: File) => void | Promise<boolean>
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
  onSendVoice,
  onSendImage,
}: MessageInputProps) {
  const tabBarOverlay = useTabBarOverlayOptional()
  const tabBarOverlayRef = useRef(tabBarOverlay)
  tabBarOverlayRef.current = tabBarOverlay
  const [value, setValue] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [mode, setMode] = useState<ComposerMode>("text")
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const imageFileInputRef = useRef<HTMLInputElement | null>(null)
  const typingSentRef = useRef(false)
  const onTypingActivityRef = useRef(onTypingActivity)
  onTypingActivityRef.current = onTypingActivity
  const hasText = value.trim().length > 0
  const narrowViewport = useMediaQuery(chatComposerTabLayoutMediaQuery())
  const sendOnEnter = !narrowViewport
  const voiceEnabled = Boolean(onSendVoice)
  const imageEnabled = Boolean(onSendImage)

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
    if (disabled) {
      setMode("text")
    }
  }, [disabled])

  useEffect(() => {
    if (!voiceEnabled) {
      setMode("text")
    }
  }, [voiceEnabled])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || mode !== "text") return

    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [value, mode])

  useEffect(() => {
    if (!onTypingActivity || disabled || mode !== "text") {
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
  }, [value, onTypingActivity, disabled, mode])

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

  const openVoiceMode = () => {
    if (disabled || !voiceEnabled) return
    setMode("voice")
  }

  const backToTextMode = () => {
    setMode("text")
  }

  const handleVoiceComplete = async (blob: Blob) => {
    if (!onSendVoice || disabled) return
    try {
      const result = await Promise.resolve(onSendVoice(blob))
      if (result !== false) {
        setMode("text")
      }
    } catch {
      // остаёмся в режиме голоса
    }
  }

  const handleImageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !onSendImage || disabled) return
    if (!file.type.startsWith("image/")) {
      window.alert("Выберите файл изображения.")
      return
    }
    try {
      await Promise.resolve(onSendImage(file))
    } catch {
      // onSendImage показывает ошибку снаружи
    }
  }

  const replyText = replyToMessage
    ? chatMessagePreview({
        content: replyToMessage.content,
        type: replyToMessage.type,
        fileUrl: replyToMessage.fileUrl,
      })
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180)
    : ""

  const messageRowClass =
    mode === "voice" && voiceEnabled
      ? `${styles.message} ${styles.messageVoice}`
      : styles.message

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

      <div className={messageRowClass}>
        <input
          ref={imageFileInputRef}
          type="file"
          accept="image/*"
          className={styles.visuallyHidden}
          tabIndex={-1}
          aria-hidden
          onChange={(event) => void handleImageFileChange(event)}
        />
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Прикрепить изображение"
          title={imageEnabled ? "Отправить фото" : "Скоро доступно"}
          disabled={disabled || mode === "voice" || !imageEnabled}
          onClick={() => imageFileInputRef.current?.click()}
        >
          <Image src="/icon-attachment.svg" alt="" width={24} height={24} className={styles.attachmentButton} />
        </button>

        {mode === "voice" && voiceEnabled ? (
          <VoiceInput embedded onSend={handleVoiceComplete} disabled={disabled} />
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onFocus={() => tabBarOverlayRef.current?.setChatComposerFocused(true)}
            onBlur={() => tabBarOverlayRef.current?.setChatComposerFocused(false)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") {
                return
              }
              if (sendOnEnter) {
                if (event.shiftKey) {
                  return
                }
                event.preventDefault()
                void submit()
                return
              }
              if (event.metaKey || event.ctrlKey) {
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
        )}

        {mode === "voice" && voiceEnabled ? (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Текстовое сообщение"
            title="Клавиатура"
            onClick={backToTextMode}
            disabled={disabled}
          >
            <Image
              src="/icon-keyboard.svg"
              alt=""
              width={26}
              height={26}
              className={styles.keyboardButton}
            />
          </button>
        ) : hasText ? (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Отправить сообщение"
            onClick={() => void submit()}
            disabled={disabled || isSending}
          >
            <Image src="/icon-send.svg" className={styles.sendButton} alt="" width={22} height={22} />
          </button>
        ) : voiceEnabled ? (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Голосовое сообщение"
            title="Голосовое"
            onClick={openVoiceMode}
            disabled={disabled}
          >
            <Image src="/icon-micro.svg" alt="" width={34} height={34} className={styles.microButton} />
          </button>
        ) : (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Отправить сообщение"
            onClick={() => void submit()}
            disabled={disabled || !hasText || isSending}
          >
            <Image src="/icon-send.svg" className={styles.sendButton} alt="" width={22} height={22} />
          </button>
        )}
      </div>
    </div>
  )
}
