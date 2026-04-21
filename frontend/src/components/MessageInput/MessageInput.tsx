"use client"

import { useTranslations } from "next-intl"
import { useTabBarOverlayOptional } from "@/contexts/TabBarOverlayContext"
import { chatComposerTabLayoutMediaQuery, useMediaQuery } from "@/hooks/useMediaQuery"
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react"
import { chatMessagePreview } from "@/lib/chatMessagePreview"
import styles from "@/components/MessageInput/MessageInput.module.scss"
import Image from "next/image"
import type { Message } from "@/types/message"
import VoiceInput from "@/components/VoiceInput/VoiceInput"
import StickerPicker, { type StickerItem } from "@/components/StickerPicker/StickerPicker"
import SheepRecordButton from "@/components/SheepRecordButton/SheepRecordButton"

type ComposerMode = "text" | "voice"

type MessageInputProps = {
  onSend: (text: string, replyToMessage?: Message | null) => Promise<boolean>
  onSaveEdit?: (messageId: string, text: string) => Promise<boolean>
  editingMessage?: Message | null
  replyToMessage?: Message | null
  onCancelReply?: () => void
  onCancelEdit?: () => void
  disabled?: boolean
  placeholder?: string
  /** Сигнал для індикатора «друкує» (debounce всередині). */
  onTypingActivity?: (isActivelyTyping: boolean) => void
  /**
  * Голосові повідомлення: при порожньому полі праворуч показується мікрофон (як у Telegram).
  * Після успішного надсилання повертайте true.
   */
  onSendVoice?: (blob: Blob) => void | Promise<boolean>
  /** Зображення в чат (кнопка скріпки ліворуч). */
  onSendImage?: (file: File) => void | Promise<boolean>
  onSelectFiles?: (files: File[]) => void | Promise<void>
  onSendSticker?: (sticker: StickerItem) => void | Promise<boolean>
  onVoiceRecordingActivity?: (active: boolean) => void
  onStartVideoRecording?: () => void | Promise<void>
  onStopVideoRecording?: () => void | Promise<void>
  isVideoRecording?: boolean
}

const MAX_MESSAGE_LENGTH = 2000
const MAX_TEXTAREA_HEIGHT = 140
const MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024

/** Після очищення поля на мобільних PWA треба повернути фокус; на iOS — повтор у наступному тіку. */
function focusComposerTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return
  textarea.focus()
  window.setTimeout(() => {
    textarea.focus()
  }, 0)
}

function handleSendPointerDown(event: PointerEvent<HTMLButtonElement>) {
  event.preventDefault()
}

export default function MessageInput({
  onSend,
  onSaveEdit,
  editingMessage,
  replyToMessage,
  onCancelReply,
  onCancelEdit,
  disabled = false,
  placeholder,
  onTypingActivity,
  onSendVoice,
  onSendImage,
  onSelectFiles,
  onSendSticker,
  onVoiceRecordingActivity,
  onStartVideoRecording,
  onStopVideoRecording,
  isVideoRecording = false,
}: MessageInputProps) {
  const t = useTranslations("chat")
  const tabBarOverlay = useTabBarOverlayOptional()
  const tabBarOverlayRef = useRef(tabBarOverlay)
  tabBarOverlayRef.current = tabBarOverlay
  const [value, setValue] = useState("")
  const [isSending, setIsSending] = useState(false)
  const isSendingRef = useRef(false)
  const [mode, setMode] = useState<ComposerMode>("text")
  const [recordMode, setRecordMode] = useState<"voice" | "sheep">("voice")
  const [isStickerPickerOpen, setIsStickerPickerOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const imageFileInputRef = useRef<HTMLInputElement | null>(null)
  const stickerDockRef = useRef<HTMLDivElement | null>(null)
  const typingSentRef = useRef(false)
  const onTypingActivityRef = useRef(onTypingActivity)
  onTypingActivityRef.current = onTypingActivity
  const hasText = value.trim().length > 0
  const narrowViewport = useMediaQuery(chatComposerTabLayoutMediaQuery())
  const sendOnEnter = !narrowViewport
  const voiceEnabled = Boolean(onSendVoice)
  const sheepVideoEnabled = Boolean(onStartVideoRecording && onStopVideoRecording)
  const imageEnabled = Boolean(onSendImage)
  const filesEnabled = Boolean(onSelectFiles)
  const stickerEnabled = Boolean(onSendSticker)
  const composerPlaceholder = placeholder ?? t("composerDefaultPlaceholder")

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
      setIsStickerPickerOpen(false)
    }
  }, [disabled])

  useEffect(() => {
    if (!voiceEnabled) {
      setMode("text")
    }
  }, [voiceEnabled])

  useEffect(() => {
    if (mode === "voice") {
      setIsStickerPickerOpen(false)
    }
  }, [mode])

  useEffect(() => {
    if (!editingMessage) {
      return
    }
    setMode("text")
    setIsStickerPickerOpen(false)
    setValue(editingMessage.content)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }, [editingMessage])

  useEffect(() => {
    if (!isStickerPickerOpen) {
      return
    }

    const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (stickerDockRef.current?.contains(target)) {
        return
      }
      setIsStickerPickerOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDownOutside)
    document.addEventListener("touchstart", handlePointerDownOutside)
    return () => {
      document.removeEventListener("mousedown", handlePointerDownOutside)
      document.removeEventListener("touchstart", handlePointerDownOutside)
    }
  }, [isStickerPickerOpen])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || mode !== "text") return

    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`
  }, [value, mode])

  useEffect(() => {
    if (!onTypingActivity || disabled || mode !== "text" || isSending) {
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
  }, [value, onTypingActivity, disabled, mode, isSending])

  const submit = async () => {
    const text = value.trim()
    if (!text || disabled) return
    if (isSendingRef.current) return

    isSendingRef.current = true
    setIsSending(true)
    try {
      const isSent = editingMessage
        ? await onSaveEdit?.(editingMessage.id, text)
        : await onSend(text, replyToMessage)
      if (isSent) {
        setValue("")
        if (editingMessage) {
          onCancelEdit?.()
        } else {
          onCancelReply?.()
        }
        if (mode === "text") {
          focusComposerTextarea(textareaRef.current)
        }
      }
    } finally {
      isSendingRef.current = false
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

  const handleRecordButtonLongPressStart = async () => {
    if (disabled) return
    if (recordMode === "voice") {
      openVoiceMode()
      return
    }
    await Promise.resolve(onStartVideoRecording?.())
  }

  const handleRecordButtonLongPressEnd = async () => {
    if (disabled || recordMode !== "sheep") return
    await Promise.resolve(onStopVideoRecording?.())
  }

  const handleVoiceComplete = async (blob: Blob) => {
    if (!onSendVoice || disabled) return
    try {
      const result = await Promise.resolve(onSendVoice(blob))
      if (result !== false) {
        setMode("text")
      }
    } catch {
      // лишаємось у режимі голосу
    }
  }

  const handleImageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ""
    if (!selectedFiles.length || disabled) return

    const tooLarge = selectedFiles.find((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES)
    if (tooLarge) {
      window.alert(t("fileTooLarge", { name: tooLarge.name }))
      return
    }

    if (onSelectFiles) {
      try {
        await Promise.resolve(onSelectFiles(selectedFiles))
      } catch {
        // onSelectFiles показує помилку зовні
      }
      return
    }

    const firstImageFile = selectedFiles.find((file) => file.type.startsWith("image/"))
    if (!firstImageFile || !onSendImage) {
      window.alert(t("pickImageFile"))
      return
    }
    try {
      await Promise.resolve(onSendImage(firstImageFile))
    } catch {
      // onSendImage показує помилку зовні
    }
  }

  const handleStickerSelect = async (sticker: StickerItem) => {
    if (!onSendSticker || disabled) return
    try {
      const result = await Promise.resolve(onSendSticker(sticker))
      if (result !== false) {
        setIsStickerPickerOpen(false)
      }
    } catch {
      // помилку показуємо зовні
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
      {editingMessage ? (
        <div className={styles.replyingTo}>
          <div className={styles.replyingToMeta}>
            <span className={styles.replyingToLabel}>{t("editingMessageBanner")}</span>
            <span className={styles.replyingToText}>
              {chatMessagePreview({
                content: editingMessage.content,
                type: editingMessage.type,
                fileUrl: editingMessage.fileUrl,
              })}
            </span>
          </div>
          <button
            type="button"
            className={styles.replyingToClose}
            aria-label={t("cancelEditAria")}
            onClick={onCancelEdit}
          >
            ×
          </button>
        </div>
      ) : null}
      {replyToMessage ? (
        <div className={styles.replyingTo}>
          <div className={styles.replyingToMeta}>
            <span className={styles.replyingToLabel}>
              {t("replyToBanner", { name: replyToMessage.username })}
            </span>
            <span className={styles.replyingToText}>{replyText}</span>
          </div>
          <button
            type="button"
            className={styles.replyingToClose}
            aria-label={t("cancelReplyAria")}
            onClick={onCancelReply}
          >
            ×
          </button>
        </div>
      ) : null}

      <div className={styles.composerRow}>
        <div className={messageRowClass}>
        <input
          ref={imageFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,audio/mpeg,audio/mp3,audio/x-m4a,audio/mp4,application/pdf,application/epub+zip,.mp3,.m4a,.pdf,.epub"
          multiple
          className={styles.visuallyHidden}
          tabIndex={-1}
          aria-hidden
          onChange={(event) => void handleImageFileChange(event)}
        />
        <button
          type="button"
          className={styles.iconButton}
          aria-label={t("attachFileAria")}
          title={filesEnabled || imageEnabled ? t("attachFileTitle") : t("attachSoonTitle")}
          disabled={disabled || mode === "voice" || (!imageEnabled && !filesEnabled)}
          onClick={() => imageFileInputRef.current?.click()}
        >
          <Image src="/icon-attachment.svg" alt="" width={20} height={20} className={styles.iconGraphic} />
        </button>

        {mode === "voice" && voiceEnabled ? (
          <VoiceInput
            embedded
            onSend={handleVoiceComplete}
            disabled={disabled}
            onRecordingActivity={onVoiceRecordingActivity}
          />
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
            placeholder={composerPlaceholder}
            className={styles.input}
            aria-label={t("composerMessageAria")}
            readOnly={disabled || isSending}
          />
        )}

        {mode === "voice" && voiceEnabled ? (
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t("composerMessageAria")}
            title={t("composerKeyboardTitle")}
            onClick={backToTextMode}
            disabled={disabled}
          >
            <Image src="/icon-msg.svg" alt="" width={20} height={20} className={styles.iconGraphic} />
          </button>
        ) : hasText ? (
          <button
            type="button"
            className={`${styles.iconButton}${isSending ? ` ${styles.iconButtonSending}` : ""}`}
            aria-label={t("sendMessageAria")}
            aria-busy={isSending || undefined}
            onPointerDown={handleSendPointerDown}
            onClick={() => void submit()}
            disabled={disabled}
          >
            <Image src="/icon-send.svg" className={styles.iconGraphic} alt="" width={20} height={20} />
          </button>
        ) : voiceEnabled ? (
          sheepVideoEnabled ? (
            <SheepRecordButton
              mode={recordMode}
              disabled={disabled}
              isRecording={isVideoRecording}
              onToggleMode={() => {
                setRecordMode((prev) => (prev === "voice" ? "sheep" : "voice"))
              }}
              onLongPressStart={handleRecordButtonLongPressStart}
              onLongPressEnd={handleRecordButtonLongPressEnd}
            />
          ) : (
            <button
              type="button"
              className={styles.iconButton}
              aria-label={t("voiceMessageAria")}
              title={t("voiceMessageTitle")}
              onClick={openVoiceMode}
              disabled={disabled}
            >
              <Image src="/icon-micro.svg" alt="" width={40} height={40} className={styles.microIconGraphic} />
            </button>
          )
        ) : (
          <button
            type="button"
            className={`${styles.iconButton}${isSending ? ` ${styles.iconButtonSending}` : ""}`}
            aria-label={t("sendMessageAria")}
            aria-busy={isSending || undefined}
            onPointerDown={handleSendPointerDown}
            onClick={() => void submit()}
            disabled={disabled || !hasText}
          >
            <Image src="/icon-send.svg" className={styles.iconGraphic} alt="" width={20} height={20} />
          </button>
        )}
        </div>
        {stickerEnabled ? (
          <div className={styles.stickerDock} ref={stickerDockRef}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={t("openStickersAria")}
              title={t("stickersTitle")}
              onClick={() => setIsStickerPickerOpen((prev) => !prev)}
              disabled={disabled || mode === "voice"}
            >
              <Image
                src="/stickers/icon-stick.png"
                alt=""
                width={24}
                height={24}
                className={styles.stickerIconGraphic}
              />
            </button>
            {isStickerPickerOpen ? (
              <div className={styles.stickerPickerWrap}>
                <StickerPicker onSelect={(sticker) => void handleStickerSelect(sticker)} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
