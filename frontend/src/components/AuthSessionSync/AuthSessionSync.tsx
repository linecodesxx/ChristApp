"use client"

import { useEffect, useRef } from "react"
import { AUTH_CHANGED_EVENT, getAuthToken } from "@/lib/auth"
import { initializeApp, logout, refreshToken } from "@/lib/authSession"
import { getJwtExpiresAt } from "@/lib/jwtUser"

const REFRESH_SKEW_MS = 60_000
const MIN_RETRY_MS = 15_000
const VISIBILITY_REFRESH_WINDOW_MS = 2 * 60_000

export default function AuthSessionSync() {
  const timeoutRef = useRef<number | null>(null)

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
      } catch {
        clearScheduledRefresh()
        await logout({ callBackend: false })
        return false
      }
    }

    const refreshIfNeeded = async (force: boolean) => {
      const token = getAuthToken()

      if (!token) {
        return
      }

      const expiresAt = getJwtExpiresAt(token)
      if (!expiresAt) {
        if (force) {
          await refreshAccessToken()
        } else {
          scheduleRefreshFromToken()
        }
        return
      }

      if (force || expiresAt - Date.now() <= VISIBILITY_REFRESH_WINDOW_MS) {
        await refreshAccessToken()
        return
      }

      scheduleRefreshFromToken()
    }

    const onAuthChanged = () => {
      scheduleRefreshFromToken()
    }

    const onFocus = () => {
      void refreshIfNeeded(true)
    }

    const onOnline = () => {
      void refreshIfNeeded(true)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshIfNeeded(true)
      }
    }

    void initializeApp().then(() => {
      void refreshIfNeeded(false)
    })

    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged)
    window.addEventListener("focus", onFocus)
    window.addEventListener("online", onOnline)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      clearScheduledRefresh()
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("online", onOnline)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  return null
}