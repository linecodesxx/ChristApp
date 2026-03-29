"use client"

import { useEffect, useState } from "react"
import FeatherDivider from "./FeatherDivider"
import styles from "./PremiumNoteForm.module.scss"

type PremiumNoteFormProps = {
  onSubmit: (source: string, response: string) => void
  disabled?: boolean
  /** Текст из сцены пергамента — один раз добавится в «Отклик». */
  appendToResponse?: string | null
  onAppendConsumed?: () => void
}

export default function PremiumNoteForm({
  onSubmit,
  disabled,
  appendToResponse,
  onAppendConsumed,
}: PremiumNoteFormProps) {
  const [source, setSource] = useState("")
  const [response, setResponse] = useState("")

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

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <p className={styles.labelSource}>Источник</p>
      <textarea
        id="verse-note-source"
        className={styles.sourceField}
        placeholder="Вставьте стих или цитату из Писания…"
        aria-label="Источник: цитата или стих"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        disabled={disabled}
        rows={5}
      />

      <FeatherDivider />

      <p className={styles.labelResponse}>Отклик</p>
      <textarea
        id="verse-note-response"
        className={styles.responseField}
        placeholder="Что откликается в сердце, какие мысли и чувства…"
        aria-label="Отклик: личные мысли"
        value={response}
        onChange={(e) => setResponse(e.target.value)}
        disabled={disabled}
        rows={5}
      />

      <div className={styles.actions}>
        <button type="submit" className={styles.submit} disabled={disabled || !canSubmit}>
          Сохранить заметку
        </button>
      </div>
    </form>
  )
}

