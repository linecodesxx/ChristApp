"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import styles from "./NoteShareModal.module.scss"

export type NoteShareModalProps = {
  isOpen: boolean
  onClose: () => void
  sourceText: string
  responseText: string
  createdAt?: string
}

function formatDate(iso: string | undefined): string {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  } catch {
    return ""
  }
}

export default function NoteShareModal({
  isOpen,
  onClose,
  sourceText,
  responseText,
  createdAt,
}: NoteShareModalProps) {
  const [copied, setCopied] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Close on Escape */
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isOpen, onClose])

  /* Reset copied state when modal closes */
  useEffect(() => {
    if (!isOpen) setCopied(false)
  }, [isOpen])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  const shareText = [
    sourceText.trim() ? `📖 ${sourceText.trim()}` : null,
    responseText.trim() ? `\n💭 ${responseText.trim()}` : null,
    "\n\n— ChristApp",
  ]
    .filter(Boolean)
    .join("")

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      closeTimerRef.current = setTimeout(() => setCopied(false), 2200)
    } catch {
      /* fallback: select all text */
    }
  }, [shareText])

  const handleWebShare = useCallback(async () => {
    if (!navigator.share) return
    try {
      await navigator.share({ text: shareText })
    } catch {
      /* user cancelled */
    }
  }, [shareText])

  if (!isOpen) return null

  const dateLine = formatDate(createdAt)
  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Поделиться заметкой"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* warm bokeh backdrop */}
      <div className={styles.bokehLayer} aria-hidden />

      <div className={styles.sheet}>
        {/* close × */}
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>

        <p className={styles.modalKicker}>Поделиться заметкой</p>

        {/* Preview card — exactly what will be shared visually */}
        <div className={styles.card}>
          {dateLine ? <p className={styles.cardDate}>{dateLine}</p> : null}

          {sourceText.trim() ? (
            <div className={styles.sourceBlock}>
              <span className={styles.blockLabel}>Источник</span>
              <p className={styles.sourceText}>{sourceText}</p>
            </div>
          ) : null}

          {sourceText.trim() && responseText.trim() ? (
            <div className={styles.divider} aria-hidden>
              <span className={styles.dividerLine} />
              <span className={styles.dividerGlyph}>✦</span>
              <span className={styles.dividerLine} />
            </div>
          ) : null}

          {responseText.trim() ? (
            <div className={styles.responseBlock}>
              <span className={styles.blockLabel}>Отклик</span>
              <p className={styles.responseText}>{responseText}</p>
            </div>
          ) : null}

          <p className={styles.brandLine}>ChristApp</p>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.copyBtn} ${copied ? styles.copied : ""}`}
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <CheckIcon />
                Скопировано
              </>
            ) : (
              <>
                <CopyIcon />
                Копировать
              </>
            )}
          </button>

          {canNativeShare ? (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.shareBtn}`}
              onClick={handleWebShare}
            >
              <ShareArrowIcon />
              Поделиться
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ─── inline SVG icons ───────────────────────────────────────────────── */

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ShareArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
