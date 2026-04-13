"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import FeatherDivider from "./FeatherDivider"
import styles from "./PremiumNoteForm.module.scss"

const TEXTAREA_MIN_PX = 96

function useAutosizeTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const adjust = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "0"
    el.style.overflowY = "hidden"
    el.style.height = `${Math.max(TEXTAREA_MIN_PX, el.scrollHeight)}px`
  }, [])

  useLayoutEffect(() => {
    adjust()
  }, [value, adjust])

  useLayoutEffect(() => {
    adjust()
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => adjust()) : null
    if (ref.current && ro) {
      ro.observe(ref.current)
    }
    return () => ro?.disconnect()
  }, [adjust])

  return { ref, adjust }
}

type PremiumNoteFormProps = {
  onSubmit: (source: string, response: string) => void
  disabled?: boolean
  /** Текст зі сцени пергаменту — один раз додасться у «Відгук». */
  appendToResponse?: string | null
  onAppendConsumed?: () => void
}

function CornerPenIcon({ animating }: { animating: boolean }) {
  return (
    <div className={`${styles.cornerPen} ${animating ? styles.cornerPenWriting : ""}`} aria-hidden>
      <svg className={styles.cornerPenSvg} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5l6.74-6.76z"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16 8L2 22"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
        <path d="M17.5 15H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      </svg>
    </div>
  )
}

export default function PremiumNoteForm({
  onSubmit,
  disabled,
  appendToResponse,
  onAppendConsumed,
}: PremiumNoteFormProps) {
  const [source, setSource] = useState("")
  const [response, setResponse] = useState("")
  const [focusedSlot, setFocusedSlot] = useState<null | "source" | "response">(null)

  const sourceAutosize = useAutosizeTextarea(source)
  const responseAutosize = useAutosizeTextarea(response)

  const handleFieldBlur = useCallback(() => {
    requestAnimationFrame(() => {
      const a = document.activeElement
      if (a !== sourceAutosize.ref.current && a !== responseAutosize.ref.current) {
        setFocusedSlot(null)
      }
    })
  }, [sourceAutosize.ref, responseAutosize.ref])

  useEffect(() => {
    if (appendToResponse == null || !appendToResponse.trim()) {
      return
    }
    const chunk = appendToResponse.trim()
    setResponse((prev) => (prev.trim() ? `${prev.trim()}\n\n${chunk}` : chunk))
    onAppendConsumed?.()
  }, [appendToResponse, onAppendConsumed])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!source.trim() && !response.trim()) {
      return
    }
    onSubmit(source, response)
    setSource("")
    setResponse("")
  }

  const canSubmit = Boolean(source.trim() || response.trim())
  const hasDraftText = source.length > 0 || response.length > 0
  const penAnimating = focusedSlot !== null

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.sheet}>
        <CornerPenIcon animating={penAnimating} />

        <p className={styles.labelSource}>Источник</p>
        <textarea
          id="verse-note-source"
          ref={sourceAutosize.ref}
          className={styles.sourceField}
          placeholder="Вставьте стих или цитату из Писания…"
          aria-label="Источник: цитата или стих"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onFocus={() => setFocusedSlot("source")}
          onBlur={handleFieldBlur}
          disabled={disabled}
          rows={3}
        />

        <FeatherDivider active={hasDraftText} />

        <p className={styles.labelResponse}>Отклик</p>
        <textarea
          id="verse-note-response"
          ref={responseAutosize.ref}
          className={styles.responseField}
          placeholder="Что откликается в сердце, какие мысли и чувства…"
          aria-label="Отклик: личные мысли"
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          onFocus={() => setFocusedSlot("response")}
          onBlur={handleFieldBlur}
          disabled={disabled}
          rows={3}
        />

        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={disabled || !canSubmit}>
            Сохранить заметку
          </button>
        </div>
      </div>
    </form>
  )
}
