"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "@/i18n/navigation"
import { AUTH_CHANGED_EVENT, getAuthToken } from "@/lib/auth"
import { fetchPushStatus, isPushSupportedInBrowser, syncBrowserPushSubscription } from "@/lib/push"

const AUTO_SYNC_INTERVAL_MS = 120_000
const MIN_ATTEMPT_INTERVAL_MS = 15_000

export default function PushAutoSync() {
  const pathname = usePathname()
  const [token, setToken] = useState<string | null>(null)
  const isSyncInFlightRef = useRef(false)
  const lastAttemptAtRef = useRef(0)

  const syncIfNeeded = useCallback(async () => {
    if (!token || !isPushSupportedInBrowser()) {
      return
    }

    if (Notification.permission !== "granted") {
      return
    }

    if (isSyncInFlightRef.current) {
      return
    }

    const now = Date.now()
    if (now - lastAttemptAtRef.current < MIN_ATTEMPT_INTERVAL_MS) {
      return
    }

    isSyncInFlightRef.current = true
    lastAttemptAtRef.current = now

    try {
      const pushStatus = await fetchPushStatus(token)
      if (!pushStatus?.enabled || pushStatus.hasSubscription) {
        return
      }

      await syncBrowserPushSubscription(token)
    } finally {
      isSyncInFlightRef.current = false
    }
  }, [token])

  useEffect(() => {
    setToken(getAuthToken())
  }, [pathname])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const syncToken = () => setToken(getAuthToken())

    window.addEventListener("focus", syncToken)
    window.addEventListener("storage", syncToken)
    window.addEventListener(AUTH_CHANGED_EVENT, syncToken)
    document.addEventListener("visibilitychange", syncToken)

    return () => {
      window.removeEventListener("focus", syncToken)
      window.removeEventListener("storage", syncToken)
      window.removeEventListener(AUTH_CHANGED_EVENT, syncToken)
      document.removeEventListener("visibilitychange", syncToken)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      return
    }

    void syncIfNeeded()

    const intervalId = window.setInterval(() => {
      void syncIfNeeded()
    }, AUTO_SYNC_INTERVAL_MS)

    const onFocus = () => {
      void syncIfNeeded()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncIfNeeded()
      }
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [syncIfNeeded, token])

  return null
}
