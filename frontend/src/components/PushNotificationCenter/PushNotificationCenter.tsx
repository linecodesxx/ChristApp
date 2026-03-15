"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { getAuthToken } from "@/lib/auth"
import { requestNotificationPermissionIfNeeded } from "@/lib/notifications"
import {
  fetchPushStatus,
  fetchUnreadSummary,
  getPushSyncErrorMessage,
  isPushSupportedInBrowser,
  syncBrowserPushSubscription,
} from "@/lib/push"
import styles from "./PushNotificationCenter.module.scss"

const REFRESH_INTERVAL_MS = 45_000

type PermissionState = NotificationPermission | "unsupported"

function getPermissionState(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported"
  }

  return Notification.permission
}

function formatUnreadMessage(count: number) {
  const absCount = Math.abs(count)
  const mod10 = absCount % 10
  const mod100 = absCount % 100

  if (mod10 === 1 && mod100 !== 11) {
    return `У тебя ${count} непрочитанное сообщение.`
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `У тебя ${count} непрочитанных сообщения.`
  }

  return `У тебя ${count} непрочитанных сообщений.`
}

export default function PushNotificationCenter() {
  const pathname = usePathname()
  const [token, setToken] = useState<string | null>(() => getAuthToken())
  const [permissionState, setPermissionState] = useState<PermissionState>(getPermissionState)
  const [isPushConfigured, setIsPushConfigured] = useState(false)
  const [hasServerSubscription, setHasServerSubscription] = useState(false)
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const isPublicRoute = pathname === "/" || pathname === "/register" || pathname === "/offline"
  const isProfileRoute = pathname === "/profile" || pathname.startsWith("/profile/")

  const refreshState = useCallback(
    async (options?: { syncSubscription?: boolean }) => {
      if (!token) {
        setIsPushConfigured(false)
        setHasServerSubscription(false)
        setUnreadTotal(0)
        setSyncErrorMessage(null)
        setPermissionState(getPermissionState())
        setIsLoading(false)
        return
      }

      const nextPermission = getPermissionState()
      setPermissionState(nextPermission)

      const [pushStatus, unreadSummary] = await Promise.all([
        fetchPushStatus(token),
        fetchUnreadSummary(token),
      ])

      setIsPushConfigured(Boolean(pushStatus?.enabled))
      setHasServerSubscription(Boolean(pushStatus?.hasSubscription))
      setUnreadTotal(Number(unreadSummary?.totalUnread ?? 0))

      if (pushStatus?.hasSubscription || nextPermission !== "granted" || !pushStatus?.enabled) {
        setSyncErrorMessage(null)
      }

      // Автосинхронизация: если разрешение уже выдано, пробуем
      // в фоне зарегистрировать (или обновить) подписку браузера.
      if (options?.syncSubscription && nextPermission === "granted" && pushStatus?.enabled) {
        const syncResult = await syncBrowserPushSubscription(token)
        setSyncErrorMessage(syncResult.success ? null : getPushSyncErrorMessage(syncResult.reason))

        const refreshedStatus = await fetchPushStatus(token)
        if (refreshedStatus) {
          setIsPushConfigured(Boolean(refreshedStatus.enabled))
          setHasServerSubscription(Boolean(refreshedStatus.hasSubscription))
          if (refreshedStatus.hasSubscription) {
            setSyncErrorMessage(null)
          }
        }
      }

      setIsLoading(false)
    },
    [token],
  )

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const syncToken = () => setToken(getAuthToken())

    window.addEventListener("focus", syncToken)
    window.addEventListener("storage", syncToken)
    document.addEventListener("visibilitychange", syncToken)

    return () => {
      window.removeEventListener("focus", syncToken)
      window.removeEventListener("storage", syncToken)
      document.removeEventListener("visibilitychange", syncToken)
    }
  }, [])

  useEffect(() => {
    if (!token) {
      return
    }

    let isCancelled = false

    const runRefresh = async () => {
      if (isCancelled) return
      await refreshState({ syncSubscription: true })
    }

    void runRefresh()

    const intervalId = window.setInterval(() => {
      void refreshState()
    }, REFRESH_INTERVAL_MS)

    const handleFocusRefresh = () => {
      void refreshState()
    }

    window.addEventListener("focus", handleFocusRefresh)
    document.addEventListener("visibilitychange", handleFocusRefresh)

    return () => {
      isCancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener("focus", handleFocusRefresh)
      document.removeEventListener("visibilitychange", handleFocusRefresh)
    }
  }, [refreshState, token])

  const permissionLabel = useMemo(() => {
    if (!isPushSupportedInBrowser()) {
      return "Устройство не поддерживает Push"
    }

    if (permissionState === "granted") {
      return "Разрешены"
    }

    if (permissionState === "denied") {
      return "Заблокированы"
    }

    if (permissionState === "default") {
      return "Нужно разрешение"
    }

    return "Неизвестно"
  }, [permissionState])

  const deliveryStatusLabel = useMemo(() => {
    if (!isPushSupportedInBrowser()) {
      return "Недоступно"
    }

    if (!isPushConfigured) {
      return "Сервер не настроен"
    }

    if (permissionState !== "granted") {
      return "Нет разрешения"
    }

    return hasServerSubscription ? "Активно" : "Не подключено"
  }, [hasServerSubscription, isPushConfigured, permissionState])

  // После выдачи разрешения управление push отображаем только в профиле.
  const shouldShowBanner = permissionState !== "granted" || isProfileRoute

  const handleRequestPermission = async () => {
    const permission = await requestNotificationPermissionIfNeeded()
    if (permission !== "granted") {
      setSyncErrorMessage(null)
    }
    await refreshState({ syncSubscription: true })
  }

  const handleConnectPush = async () => {
    if (!token) return
    const syncResult = await syncBrowserPushSubscription(token)
    setSyncErrorMessage(syncResult.success ? null : getPushSyncErrorMessage(syncResult.reason))
    await refreshState()
  }

  if (isPublicRoute || !token) {
    return null
  }

  if (!shouldShowBanner) {
    return null
  }

  return (
    <section className={styles.banner} aria-live="polite" role="status">
      <div className={styles.headerRow}>
        <p className={styles.title}>Push-уведомления</p>
        <span className={styles.badge}>{deliveryStatusLabel}</span>
      </div>

      <p className={styles.meta}>Разрешение браузера: {permissionLabel}</p>

      {unreadTotal > 0 ? <p className={styles.unread}>{formatUnreadMessage(unreadTotal)}</p> : null}

      {permissionState === "default" ? (
        <button className={styles.actionButton} onClick={handleRequestPermission} type="button">
          Разрешить уведомления
        </button>
      ) : null}

      {permissionState === "granted" && isPushConfigured && !hasServerSubscription ? (
        <button className={styles.actionButton} onClick={handleConnectPush} type="button">
          Подключить push
        </button>
      ) : null}

      {permissionState === "denied" ? (
        <p className={styles.hint}>Уведомления заблокированы. Включи их в настройках браузера для этого сайта.</p>
      ) : null}

      {syncErrorMessage ? <p className={styles.hint}>{syncErrorMessage}</p> : null}

      {!isPushConfigured ? (
        <p className={styles.hint}>Серверный push пока не настроен: добавь VAPID-ключи в backend.</p>
      ) : null}

      {isLoading ? <p className={styles.hint}>Проверяю состояние уведомлений...</p> : null}
    </section>
  )
}
