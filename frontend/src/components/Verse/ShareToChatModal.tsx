"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback"
import type { ShareTarget } from "@/lib/chatRooms"
import { getInitials } from "@/lib/utils"
import styles from "./ShareToChatModal.module.scss"

type SharePhase = "idle" | "sending" | "success"

type ShareToChatModalProps = {
  open: boolean
  targets: ShareTarget[]
  onClose: () => void
  /** Повернути true, якщо повідомлення пішло в сокет — тоді покажемо анімацію успіху й закриємо модалку. */
  onSelectTarget: (target: ShareTarget) => boolean
}

const SUCCESS_CLOSE_MS = 820

export default function ShareToChatModal({ open, targets, onClose, onSelectTarget }: ShareToChatModalProps) {
  const [search, setSearch] = useState("")
  const [phase, setPhase] = useState<SharePhase>("idle")
  const [successTarget, setSuccessTarget] = useState<ShareTarget | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setSearch("")
    setPhase("idle")
    setSuccessTarget(null)
    setActiveKey(null)
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  const filteredTargets = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    if (!normalized) return targets
    return targets.filter((target) => target.title.toLowerCase().includes(normalized))
  }, [search, targets])

  const handlePick = (target: ShareTarget) => {
    if (phase !== "idle") {
      return
    }
    const key = `${target.id}-${target.roomId}`
    setPhase("sending")
    setActiveKey(key)

    window.requestAnimationFrame(() => {
      const ok = onSelectTarget(target)
      if (!ok) {
        setPhase("idle")
        setActiveKey(null)
        return
      }
      setPhase("success")
      setSuccessTarget(target)
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null
        onClose()
      }, SUCCESS_CLOSE_MS)
    })
  }

  const handleOverlayPointerDown = () => {
    if (phase === "sending") {
      return
    }
    if (phase === "success") {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      onClose()
      return
    }
    onClose()
  }

  if (!open) {
    return null
  }

  return (
    <div className={styles.overlay} onClick={handleOverlayPointerDown}>
      <section className={styles.modal} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        {phase === "success" && successTarget ? (
          <div className={styles.successPanel} role="status" aria-live="polite">
            <div className={styles.successIconWrap} aria-hidden>
              <svg className={styles.successCheck} viewBox="0 0 48 48" width="48" height="48">
                <circle className={styles.successCircle} cx="24" cy="24" r="22" />
                <path
                  className={styles.successMark}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 24l7 7 13-14"
                />
              </svg>
            </div>
            <p className={styles.successTitle}>Стих отправлен</p>
            <p className={styles.successHint}>{successTarget.title}</p>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <h3>Поделиться стихом</h3>
              <button
                type="button"
                className={styles.closeButton}
                onClick={onClose}
                disabled={phase === "sending"}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>
            <input
              className={styles.search}
              type="search"
              placeholder="Найти чат"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={phase === "sending"}
            />
            <div className={styles.listWrap}>
              {phase === "sending" ? <div className={styles.sendingVeil} aria-hidden /> : null}
              <ul className={styles.list}>
                {filteredTargets.map((target) => {
                  const rowKey = `${target.id}-${target.roomId}`
                  const isActive = activeKey === rowKey
                  return (
                    <li key={rowKey}>
                      <button
                        type="button"
                        className={`${styles.row} ${isActive && phase === "sending" ? styles.rowActive : ""}`}
                        onClick={() => handlePick(target)}
                        disabled={phase === "sending"}
                      >
                        <span className={styles.avatarWrap}>
                          <AvatarWithFallback
                            src={target.avatarImage}
                            initials={target.avatarInitials ?? getInitials(target.title)}
                            colorSeed={target.id}
                            width={40}
                            height={40}
                            imageClassName={
                              target.avatarClass
                                ? `${styles.avatarImage} ${target.avatarClass}`
                                : styles.avatarImage
                            }
                            fallbackClassName={styles.avatarInitials}
                            fallbackTag="span"
                          />
                          {target.isOnline ? <span className={styles.onlineDot} /> : null}
                        </span>
                        <span className={styles.title}>{target.title}</span>
                        {isActive && phase === "sending" ? (
                          <span className={styles.sendingLabel}>Отправка…</span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
                {filteredTargets.length === 0 ? <li className={styles.empty}>Переписок не найдено</li> : null}
              </ul>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
