"use client"

import { useState } from "react"
import { useHydrated } from "@/hooks/useHydrated"
import FeatherDivider from "./FeatherDivider"
import NoteShareModal from "./NoteShareModal"
import styles from "./PremiumNote.module.scss"

export type PremiumNoteProps = {
  sourceText: string
  responseText: string
  createdAt?: string
}

function formatNoteDate(iso: string | undefined): string {
  if (!iso) {
    return ""
  }
  try {
    const d = new Date(iso)
    return d.toLocaleString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

export default function PremiumNote({ sourceText, responseText, createdAt }: PremiumNoteProps) {
  const hydrated = useHydrated()
  const dateLine = hydrated ? formatNoteDate(createdAt) : ""
  const [shareOpen, setShareOpen] = useState(false)

  return (
    <>
      <article className={styles.card}>
        <div className={styles.cardTopRow}>
          {createdAt ? <p className={styles.meta}>{dateLine || "\u00a0"}</p> : <span />}
          <button
            type="button"
            className={styles.shareIconBtn}
            onClick={() => setShareOpen(true)}
            aria-label="Поделиться заметкой"
          >
            <ShareIcon />
          </button>
        </div>

        <div className={styles.sourceBlock}>
          <p className={styles.sourceLabel}>Источник</p>
          <p className={styles.sourceText}>{sourceText || "—"}</p>
        </div>

        <FeatherDivider />

        <div className={styles.responseBlock}>
          <p className={styles.responseLabel}>Отклик</p>
          <p className={styles.responseText}>{responseText || "—"}</p>
        </div>
      </article>

      <NoteShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        sourceText={sourceText}
        responseText={responseText}
        createdAt={createdAt}
      />
    </>
  )
}

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
