"use client"

import { useCallback, useEffect, useRef } from "react"
import { ebGaramond } from "@/styles/fonts"
import CodePenCandle from "./CodePenCandle"
import styles from "./NoteScene.module.scss"

export type NoteSceneProps = {
  isOpen: boolean
  /** Сохранить текст и закрыть сцену (родитель снимает черновик и при необходимости переносит в форму). */
  onSave: () => void
  value: string
  onChange: (next: string) => void
  placeholder?: string
  /** Подпись для textarea и диалога (a11y). */
  ariaLabel?: string
  /** Подпись кнопки сохранения. */
  saveLabel?: string
  /** Макс. высота авто-роста textarea (px). */
  maxTextareaHeightPx?: number
}

const DEFAULT_MAX_TEXTAREA_HEIGHT = 520

/**
 * Полноэкранная сцена: размытый фон (backdrop) + тёплые блики, свеча, пергамент, «Сохранить».
 */
export default function NoteScene({
  isOpen,
  onSave,
  value,
  onChange,
  placeholder = "Пишите здесь…",
  ariaLabel = "Текст заметки",
  saveLabel = "Сохранить",
  maxTextareaHeightPx = DEFAULT_MAX_TEXTAREA_HEIGHT,
}: NoteSceneProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const syncTextareaHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    const next = Math.min(el.scrollHeight, maxTextareaHeightPx)
    el.style.height = `${next}px`
  }, [maxTextareaHeightPx])

  useEffect(() => {
    if (!isOpen) return
    syncTextareaHeight()
  }, [isOpen, value, syncTextareaHeight])

  useEffect(() => {
    if (!isOpen) return
    const id = window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className={`${styles.root} ${ebGaramond.variable}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div className={styles.backdropStack} aria-hidden>
        <div className={styles.darkBase} />
        <div className={styles.bokehLayer} />
        <div className={styles.blurLayer} />
      </div>

      <div className={styles.stage}>
        <CodePenCandle />

        <div className={styles.parchmentColumn}>
          <div className={styles.parchment}>
            <span className={styles.parchmentEdge} aria-hidden />
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              aria-label={ariaLabel}
              spellCheck
            />
          </div>
          <button type="button" className={styles.saveBtn} onClick={onSave}>
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
