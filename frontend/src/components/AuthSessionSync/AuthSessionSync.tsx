"use client"

import { useEffect, useRef, useState } from "react"
import { AUTH_CHANGED_EVENT, getAuthToken, isPwaStandaloneClient } from "@/lib/auth"
import { initializeApp, isUnauthorizedAuthError, logout, refreshToken } from "@/lib/authSession"
import { getJwtExpiresAt } from "@/lib/jwtUser"

const REFRESH_SKEW_MS = 60_000
const MIN_RETRY_MS = 15_000
const VISIBILITY_REFRESH_WINDOW_MS = 2 * 60_000
const RECOVERY_DELAY_MS = 10_000
const RECOVERY_TICK_MS = 250
const RECOVERY_RETURN_TO_KEY = "christ-recovery-return-to"

export default function AuthSessionSync() {
  const timeoutRef = useRef<number | null>(null)
  const recoveryTimeoutRef = useRef<number | null>(null)
  const recoveryTickerRef = useRef<number | null>(null)
  const recoveryInProgressRef = useRef(false)
  const [recoveryVisible, setRecoveryVisible] = useState(false)
  const [recoveryLeftMs, setRecoveryLeftMs] = useState(RECOVERY_DELAY_MS)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const clearScheduledRefresh = () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }

    const stopRecoveryUi = () => {
      if (recoveryTickerRef.current !== null) {
        window.clearInterval(recoveryTickerRef.current)
        recoveryTickerRef.current = null
      }
      if (recoveryTimeoutRef.current !== null) {
        window.clearTimeout(recoveryTimeoutRef.current)
        recoveryTimeoutRef.current = null
      }
      setRecoveryVisible(false)
      setRecoveryLeftMs(RECOVERY_DELAY_MS)
      recoveryInProgressRef.current = false
    }

    const startRecoveryCountdown = async () => {
      if (recoveryInProgressRef.current) {
        return
      }
      recoveryInProgressRef.current = true

      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.sessionStorage.setItem(RECOVERY_RETURN_TO_KEY, returnTo)

      const deadline = Date.now() + RECOVERY_DELAY_MS
      setRecoveryVisible(true)
      setRecoveryLeftMs(RECOVERY_DELAY_MS)

      recoveryTickerRef.current = window.setInterval(() => {
        setRecoveryLeftMs(Math.max(0, deadline - Date.now()))
      }, RECOVERY_TICK_MS)

      recoveryTimeoutRef.current = window.setTimeout(async () => {
        try {
          await refreshToken()
          await initializeApp()
          const target =
            window.sessionStorage.getItem(RECOVERY_RETURN_TO_KEY) ||
            `${window.location.pathname}${window.location.search}${window.location.hash}`
          window.sessionStorage.removeItem(RECOVERY_RETURN_TO_KEY)
          stopRecoveryUi()

          if (
            window.location.pathname === "/" ||
            window.location.pathname.includes("/login") ||
            window.location.pathname.includes("/register")
          ) {
            window.location.assign(target)
          } else {
            scheduleRefreshFromToken()
          }
        } catch {
          window.sessionStorage.removeItem(RECOVERY_RETURN_TO_KEY)
          stopRecoveryUi()
          await logout({ callBackend: false })
        }
      }, RECOVERY_DELAY_MS)
    }

    const scheduleRefreshFromToken = () => {
      clearScheduledRefresh()

      const token = getAuthToken()
      if (!token) {
        return
      }

      const expiresAt = getJwtExpiresAt(token)
      if (!expiresAt) {
        timeoutRef.current = window.setTimeout(() => {
          void refreshAccessToken()
        }, 5 * 60_000)
        return
      }

      const delay = Math.max(MIN_RETRY_MS, expiresAt - Date.now() - REFRESH_SKEW_MS)
      timeoutRef.current = window.setTimeout(() => {
        void refreshAccessToken()
      }, delay)
    }

    const refreshAccessToken = async (): Promise<boolean> => {
      try {
        await refreshToken()
        scheduleRefreshFromToken()
        return true
      } catch (error) {
        clearScheduledRefresh()
        if (isUnauthorizedAuthError(error)) {
          await startRecoveryCountdown()
          return false
        }

        timeoutRef.current = window.setTimeout(() => {
          void refreshAccessToken()
        }, MIN_RETRY_MS)
        return false
      }
    }

    const refreshIfNeeded = async () => {
      const token = getAuthToken()

      if (!token) {
        return
      }

      const expiresAt = getJwtExpiresAt(token)
      if (!expiresAt) {
        scheduleRefreshFromToken()
        return
      }

      if (expiresAt - Date.now() <= VISIBILITY_REFRESH_WINDOW_MS) {
        await refreshAccessToken()
        return
      }

      scheduleRefreshFromToken()
    }

    const onAuthChanged = () => {
      scheduleRefreshFromToken()
    }

    const onFocus = () => {
      void refreshIfNeeded()
    }

    const onOnline = () => {
      void refreshIfNeeded()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshIfNeeded()
      }
    }

    const runInitialSync = () => {
      if (process.env.NEXT_PUBLIC_DEBUG_PWA_AUTH === "1" && isPwaStandaloneClient()) {
        try {
          window.alert(`Debug LS: ${Boolean(window.localStorage.getItem("christ_access_token"))}`)
        } catch {
          // ignore
        }
      }
      void initializeApp().then(() => {
        void refreshIfNeeded()
      })
    }

    // PWA (standalone): пауза перед первым /refresh и /me — сетевой стек iOS чаще успевает поднять куки.
    const bootstrapDelayId = isPwaStandaloneClient()
      ? window.setTimeout(runInitialSync, 500)
      : null
    if (bootstrapDelayId === null) {
      runInitialSync()
    }

    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged)
    window.addEventListener("focus", onFocus)
    window.addEventListener("online", onOnline)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      if (bootstrapDelayId !== null) {
        window.clearTimeout(bootstrapDelayId)
      }
      clearScheduledRefresh()
      stopRecoveryUi()
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("online", onOnline)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  if (!recoveryVisible) {
    return null
  }

  const secondsLeft = Math.max(1, Math.ceil(recoveryLeftMs / 1000))

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle at 30% 20%, #31251d 0%, #1a1715 55%, #0f0e0d 100%)",
        color: "#f5ecde",
      }}
    >
      <div style={{ textAlign: "center", width: "min(86vw, 360px)" }}>
        <svg width="110" height="110" viewBox="0 0 100 100" aria-hidden>
          <path
            d="M50 18V82"
            stroke="#f0d7b0"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="10 8"
          >
            <animate attributeName="stroke-dashoffset" from="0" to="-36" dur="1.4s" repeatCount="indefinite" />
          </path>
          <path
            d="M34 44H66"
            stroke="#f0d7b0"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="10 8"
          >
            <animate attributeName="stroke-dashoffset" from="0" to="-36" dur="1.4s" repeatCount="indefinite" />
          </path>
        </svg>

        <p style={{ marginTop: 14, marginBottom: 8, fontSize: 18, fontWeight: 700 }}>
          Восстанавливаем сессию
        </p>
        <p style={{ margin: 0, opacity: 0.85, fontSize: 14 }}>
          Повторный вход через {secondsLeft} сек
        </p>
      </div>
    </div>
  )
}