"use client"

import { useCallback, useEffect, useState } from "react"
import styles from "@/components/TabBar/TabBar.module.scss"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Link, usePathname } from "@/i18n/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AUTH_CHANGED_EVENT, getAuthToken } from "@/lib/auth"
import { CHAT_UNREAD_CHANGED_EVENT } from "@/lib/chatUnreadEvents"
import {
  fetchUnreadSummaryForQuery,
  pushUnreadSummaryQueryKey,
} from "@/lib/queries/pushQueries"
import { canSeeAdminDashboardNav } from "@/lib/adminDashboardNav"
import { getUserIdFromJwt, getUsernameFromJwt } from "@/lib/jwtUser"
import {
  prefetchTabBibleData,
  prefetchTabChatData,
  prefetchTabProfileData,
} from "@/lib/tabPrefetch"
import { usePresenceSocket } from "@/components/PresenceSocket/PresenceSocket"
import { useTabBarOverlayOptional } from "@/contexts/TabBarOverlayContext"
import { chatComposerTabLayoutMediaQuery, useMediaQuery } from "@/hooks/useMediaQuery"
import { syncAppBadgeFromUnreadCount } from "@/lib/appBadge"

const UNREAD_REFRESH_INTERVAL_MS = 15_000

export default function TabBar() {
  const t = useTranslations("nav")
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const { socket } = usePresenceSocket()
  const tabBarOverlay = useTabBarOverlayOptional()
  const narrowForChatComposer = useMediaQuery(chatComposerTabLayoutMediaQuery())
  const [authEpoch, setAuthEpoch] = useState(0)
  /** Токен в localStorage недоступен на SSR — иначе число вкладок и active-иконка не совпадают с клиентом (hydration error). */
  const [tabBarClientReady, setTabBarClientReady] = useState(false)

  const token = getAuthToken()
  const userId = token ? getUserIdFromJwt(token) : undefined
  const jwtUsername = token ? getUsernameFromJwt(token) : undefined
  const showAdminDashboardTab =
    tabBarClientReady && canSeeAdminDashboardNav(jwtUsername)

  const unreadQuery = useQuery({
    queryKey: pushUnreadSummaryQueryKey(userId),
    queryFn: fetchUnreadSummaryForQuery,
    enabled: Boolean(userId),
    staleTime: 20_000,
    refetchInterval: UNREAD_REFRESH_INTERVAL_MS,
  })

  const unreadCount = Number(unreadQuery.data?.totalUnread ?? 0)

  useEffect(() => {
    void syncAppBadgeFromUnreadCount(unreadCount)
  }, [unreadCount])

  const refetchUnread = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: pushUnreadSummaryQueryKey(userId) })
  }, [queryClient, userId])

  const hiddenRoutes = ["/", "/register", "/offline"]
  /** Список чатов — таб виден; открытая комната — таб скрыт, больше места под переписку. */
  const hideOnActiveChatRoom = pathname.startsWith("/chat/")
  const shouldHideTabBar =
    hideOnActiveChatRoom || hiddenRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
  const hideForChatComposer = (tabBarOverlay?.chatComposerFocused ?? false) && narrowForChatComposer

  const isRouteActive = (route: string) => pathname === route || pathname.startsWith(`${route}/`)

  useEffect(() => {
    setTabBarClientReady(true)
  }, [])

  useEffect(() => {
    const bump = () => setAuthEpoch((n) => n + 1)
    window.addEventListener(AUTH_CHANGED_EVENT, bump)
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, bump)
  }, [])

  useEffect(() => {
    refetchUnread()
  }, [pathname, authEpoch, refetchUnread])

  useEffect(() => {
    const onFocus = () => refetchUnread()
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refetchUnread()
      }
    }

    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [refetchUnread])

  useEffect(() => {
    if (!socket) {
      return
    }

    socket.on("newMessage", refetchUnread)

    return () => {
      socket.off("newMessage", refetchUnread)
    }
  }, [socket, refetchUnread])

  useEffect(() => {
    window.addEventListener(CHAT_UNREAD_CHANGED_EVENT, refetchUnread)

    return () => {
      window.removeEventListener(CHAT_UNREAD_CHANGED_EVENT, refetchUnread)
    }
  }, [refetchUnread])

  if (shouldHideTabBar || hideForChatComposer) {
    return null
  }

  return (
    <nav className={styles.nav}>
      <Link
        className={styles.tabLink}
        href="/bible"
        prefetch
        onPointerEnter={() => prefetchTabBibleData(queryClient)}
        onFocus={() => prefetchTabBibleData(queryClient)}
        onTouchStart={() => prefetchTabBibleData(queryClient)}
      >
        <span className={`${styles.iconWrap} ${isRouteActive("/bible") ? styles.activeIcon : ""}`}>
          <Image src="/icon-bible.svg" alt={t("bible")} width={24} height={24} />
        </span>
      </Link>
      {showAdminDashboardTab ? (
        <Link
          className={styles.tabLink}
          href="/dashboard"
          prefetch
          aria-label={t("dashboard")}
          title={t("dashboard")}
        >
          <span className={`${styles.iconWrap} ${isRouteActive("/dashboard") ? styles.activeIcon : ""}`}>
            <Image src="/icon-dashboard.svg" alt="Обзор" width={24} height={24} />
          </span>
        </Link>
      ) : null}
      <Link
        className={styles.tabLink}
        href="/chat"
        prefetch
        onPointerEnter={() => prefetchTabChatData(queryClient)}
        onFocus={() => prefetchTabChatData(queryClient)}
        onTouchStart={() => prefetchTabChatData(queryClient)}
      >
        <span className={`${styles.iconWrap} ${isRouteActive("/chat") ? styles.activeIcon : ""}`}>
          <Image src="/icon-chat.svg" alt={t("chat")} width={24} height={24} loading="eager" />
          {unreadCount > 0 ? (
            <span className={styles.unreadBadge} aria-label={t("unreadMessages", { count: unreadCount })}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </span>
      </Link>
      <Link
        className={styles.tabLink}
        href="/profile"
        prefetch
        onPointerEnter={() => prefetchTabProfileData(queryClient)}
        onFocus={() => prefetchTabProfileData(queryClient)}
        onTouchStart={() => prefetchTabProfileData(queryClient)}
      >
        <span className={`${styles.iconWrap} ${isRouteActive("/profile") ? styles.activeIcon : ""}`}>
          <Image src="/icon-profile.svg" alt={t("profile")} width={24} height={24} />
        </span>
      </Link>
    </nav>
  )
}
