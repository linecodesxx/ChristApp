"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getAuthToken } from "@/lib/auth"
import styles from "./WelcomeJesusOverlay.module.scss"

const STORAGE_KEY = "christapp-welcome-jesus-shown"
/** Показ только после логина: таймер стартует после успешного `/auth/me`, не с загрузки гостевой страницы. */
const WELCOME_OVERLAY_DELAY_MS = 30_000
const AUTO_DISMISS_MS = 10_000

type MeUser = {
  username?: string
  nickname?: string | null
}

export default function WelcomeJesusOverlay() {
  const [open, setOpen] = useState(false)
  const [displayUser, setDisplayUser] = useState<MeUser | null>(null)
  const sequenceStartedRef = useRef(false)

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1")
    } catch {
      // ignore
    }
    setOpen(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    let pollTimer: number | null = null
    let waitTimer: number | null = null

    const startWelcomeSequence = async () => {
      if (cancelled || sequenceStartedRef.current) {
        return
      }

      try {
        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(STORAGE_KEY)) {
          sequenceStartedRef.current = true
          return
        }
      } catch {
        // ignore
      }

      sequenceStartedRef.current = true

      const API_URL = process.env.NEXT_PUBLIC_API_URL
      if (!API_URL) {
        sequenceStartedRef.current = false
        return
      }

      const token = getAuthToken()
      if (!token) {
        sequenceStartedRef.current = false
        return
      }

      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok || cancelled) {
        sequenceStartedRef.current = false
        return
      }

      const data = (await res.json()) as MeUser
      if (cancelled) {
        sequenceStartedRef.current = false
        return
      }

      setDisplayUser(data)

      try {
        if (sessionStorage.getItem(STORAGE_KEY)) {
          return
        }
      } catch {
        // ignore
      }

      waitTimer = window.setTimeout(() => {
        if (cancelled || !getAuthToken()) {
          return
        }
        try {
          if (sessionStorage.getItem(STORAGE_KEY)) {
            return
          }
        } catch {
          // ignore
        }
        setOpen(true)
      }, WELCOME_OVERLAY_DELAY_MS)
    }

    const tick = () => {
      if (cancelled || sequenceStartedRef.current) {
        return
      }
      if (getAuthToken()) {
        if (pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }
        void startWelcomeSequence()
      }
    }

    tick()
    let polls = 0
    pollTimer = window.setInterval(() => {
      polls += 1
      if (polls > 450) {
        if (pollTimer) {
          clearInterval(pollTimer)
          pollTimer = null
        }
        return
      }
      tick()
    }, 400)

    return () => {
      cancelled = true
      if (pollTimer) {
        clearInterval(pollTimer)
      }
      if (waitTimer) {
        clearTimeout(waitTimer)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismiss()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, dismiss])

  useEffect(() => {
    if (!open) {
      return
    }
    const timerId = window.setTimeout(() => {
      dismiss()
    }, AUTO_DISMISS_MS)
    return () => window.clearTimeout(timerId)
  }, [open, dismiss])

  if (!open || !displayUser) {
    return null
  }

  const displayName =
    (typeof displayUser.nickname === "string" && displayUser.nickname.trim()) ||
    (typeof displayUser.username === "string" && displayUser.username.trim()) ||
    "друг"

  return (
    <div className={styles.toast} role="status" aria-live="polite" aria-label="Приветствие">
      <div className={styles.panel}>
        <button type="button" className={styles.closeButton} onClick={dismiss} aria-label="Закрыть">
          ×
        </button>
        <div className={styles.jesusWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG asset */}
          <img className={styles.jesusImg} src="/JesusText.svg" alt="" width={160} height={128} />
        </div>
        <div className={styles.sign}>
          <p id="welcome-jesus-title" className={styles.signUsername}>
            {displayName}
          </p>
          <p className={styles.signWelcome}>Добро пожаловать в Christ App!</p>
        </div>
      </div>
    </div>
  )
}
