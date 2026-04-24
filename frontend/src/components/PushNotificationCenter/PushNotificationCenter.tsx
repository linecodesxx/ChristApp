"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname } from "@/i18n/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AUTH_CHANGED_EVENT, getAuthToken } from "@/lib/auth"
import { getUserIdFromJwt } from "@/lib/jwtUser"
import { requestNotificationPermissionIfNeeded } from "@/lib/notifications"
import {
  fetchPushStatusForQuery,
  fetchUnreadSummaryForQuery,
  pushStatusQueryKey,
  pushUnreadSummaryQueryKey,
} from "@/lib/queries/pushQueries"
import {
  getPushSyncErrorMessage,
  isPushSupportedInBrowser,
  syncBrowserPushSubscription,
} from "@/lib/push"
import CrossLoader from "@/components/CrossLoader/CrossLoader"
import styles from "./PushNotificationCenter.module.scss"

type PermissionState = NotificationPermission | "unsupported"

function getPermissionState(): PermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported"
  }

  return Notification.permission
}

function formatUnreadMessage(count: number) {
  if (count === 0) {
    return "У вас нет непрочитанных сообщений."
  }

  const absCount = Math.abs(count)
  const mod10 = absCount % 10
  const mod100 = absCount % 100

  if (mod10 === 1 && mod100 !== 11) {
    return `У вас ${count} непрочитанное сообщение.`
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `У вас ${count} непрочитанных сообщения.`
  }

  return `У вас ${count} непрочитанных сообщений.`
}

export default function PushNotificationCenter() {
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const [authEpoch, setAuthEpoch] = useState(0)
  const [permissionState, setPermissionState] = useState<PermissionState>(getPermissionState)
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const bump = () => setAuthEpoch((n) => n + 1)
    window.addEventListener(AUTH_CHANGED_EVENT, bump)
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, bump)
  }, [])

  const token = getAuthToken()
  const userId = token ? getUserIdFromJwt(token) : undefined

  const pushStatusQuery = useQuery({
    queryKey: pushStatusQueryKey(userId),
    queryFn: fetchPushStatusForQuery,
    enabled: Boolean(token && userId),
    staleTime: 45_000,
  })

  const unreadQuery = useQuery({
    queryKey: pushUnreadSummaryQueryKey(userId),
    queryFn: fetchUnreadSummaryForQuery,
    enabled: Boolean(token && userId),
    staleTime: 20_000,
  })

  const isPushConfigured = Boolean(pushStatusQuery.data?.enabled)
  const hasServerSubscription = Boolean(pushStatusQuery.data?.hasSubscription)
  const unreadTotal = Number(unreadQuery.data?.totalUnread ?? 0)

  const refreshState = useCallback(
    async (options?: { syncSubscription?: boolean }) => {
      const nextPermission = getPermissionState()
      setPermissionState(nextPermission)

      if (!token || !userId) {
        setSyncErrorMessage(null)
        return
      }

      const pushStatus = await queryClient.fetchQuery({
        queryKey: pushStatusQueryKey(userId),
        queryFn: fetchPushStatusForQuery,
        staleTime: 45_000,
      })

      await queryClient.fetchQuery({
        queryKey: pushUnreadSummaryQueryKey(userId),
        queryFn: fetchUnreadSummaryForQuery,
        staleTime: 20_000,
      })

      if (pushStatus?.hasSubscription || nextPermission !== "granted" || !pushStatus?.enabled) {
        setSyncErrorMessage(null)
      }

      if (options?.syncSubscription && nextPermission === "granted" && pushStatus?.enabled) {
        const syncResult = await syncBrowserPushSubscription(token)
        setSyncErrorMessage(syncResult.success ? null : getPushSyncErrorMessage(syncResult.reason))

        const refreshedStatus = await queryClient.fetchQuery({
          queryKey: pushStatusQueryKey(userId),
          queryFn: fetchPushStatusForQuery,
          staleTime: 45_000,
        })
        if (refreshedStatus?.hasSubscription) {
          setSyncErrorMessage(null)
        }
      }
    },
    [queryClient, token, userId],
  )

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const syncToken = () => setAuthEpoch((n) => n + 1)

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

    void refreshState({ syncSubscription: true })

    const handleFocusRefresh = () => {
      void refreshState()
    }

    window.addEventListener("focus", handleFocusRefresh)
    document.addEventListener("visibilitychange", handleFocusRefresh)

    return () => {
      window.removeEventListener("focus", handleFocusRefresh)
      document.removeEventListener("visibilitychange", handleFocusRefresh)
    }
  }, [refreshState, token, authEpoch])

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

  const isPublicRoute = pathname === "/" || pathname === "/register" || pathname === "/offline"
  const isProfileRoute = pathname === "/profile" || pathname.startsWith("/profile/")

  const isBootstrapping =
    Boolean(token && userId) && !pushStatusQuery.data && pushStatusQuery.isPending

  // Після надання дозволу керування push відображаємо лише в профілі.
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

  if (isBootstrapping) {
    return (
      <section
        className={styles.banner}
        aria-live="polite"
        role="status"
        aria-busy={true}
      >
        {isProfileRoute ? (
          <p className={styles.loadingPlain}>Проверка уведомлений…</p>
        ) : (
          <div className={styles.pushLoaderWrap}>
            <CrossLoader label="Проверка уведомлений" variant="inline" />
          </div>
        )}
      </section>
    )
  }

  return (
    <section
      className={styles.banner}
      aria-live="polite"
      role="status"
      aria-busy={false}
    >
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
    </section>
  )
}
