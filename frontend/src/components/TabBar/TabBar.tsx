"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import styles from "@/components/TabBar/TabBar.module.scss"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { getAuthToken } from "@/lib/auth"
import { CHAT_UNREAD_CHANGED_EVENT } from "@/lib/chatUnreadEvents"
import { fetchUnreadSummary } from "@/lib/push"
import { usePresenceSocket } from "@/components/PresenceSocket/PresenceSocket"
import { useTabBarOverlayOptional } from "@/contexts/TabBarOverlayContext"

const UNREAD_REFRESH_INTERVAL_MS = 15_000

export default function TabBar() {
  const pathname = usePathname()
  const { socket } = usePresenceSocket()
  const tabBarOverlay = useTabBarOverlayOptional()
  const [unreadCount, setUnreadCount] = useState(0)
  const hiddenRoutes = ["/", "/register"]
  const shouldHideTabBar = hiddenRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
  const hideForChatComposer = tabBarOverlay?.chatComposerFocused ?? false

  const isRouteActive = (route: string) => pathname === route || pathname.startsWith(`${route}/`)

  const refreshUnreadCount = useCallback(async () => {
    const token = getAuthToken()
    if (!token) {
      setUnreadCount(0)
      return
    }

    const unreadSummary = await fetchUnreadSummary(token)
    setUnreadCount(Number(unreadSummary?.totalUnread ?? 0))
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshUnreadCount()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [pathname, refreshUnreadCount])

  useEffect(() => {
    let cancelled = false

    const runRefresh = async () => {
      if (cancelled) {
        return
      }

      await refreshUnreadCount()
    }

    void runRefresh()

    const intervalId = window.setInterval(() => {
      void refreshUnreadCount()
    }, UNREAD_REFRESH_INTERVAL_MS)

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        void refreshUnreadCount()
      }
    }

    window.addEventListener("focus", refreshUnreadCount)
    document.addEventListener("visibilitychange", handleVisibilityRefresh)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      window.removeEventListener("focus", refreshUnreadCount)
      document.removeEventListener("visibilitychange", handleVisibilityRefresh)
    }
  }, [refreshUnreadCount])

  useEffect(() => {
    if (!socket) {
      return
    }

    const handleMessageEvent = () => {
      void refreshUnreadCount()
    }

    socket.on("newMessage", handleMessageEvent)

    return () => {
      socket.off("newMessage", handleMessageEvent)
    }
  }, [refreshUnreadCount, socket])

  useEffect(() => {
    const handleUnreadChanged = () => {
      void refreshUnreadCount()
    }

    window.addEventListener(CHAT_UNREAD_CHANGED_EVENT, handleUnreadChanged)

    return () => {
      window.removeEventListener(CHAT_UNREAD_CHANGED_EVENT, handleUnreadChanged)
    }
  }, [refreshUnreadCount])

  if (shouldHideTabBar || hideForChatComposer) {
    return null
  }

  return (
    <nav className={styles.nav}>
      <Link className={styles.tabLink} href="/bible">
        <span className={`${styles.iconWrap} ${isRouteActive("/bible") ? styles.activeIcon : ""}`}>
          <Image src="/icon-bible.svg" alt="Библия" width={24} height={24} />
        </span>
      </Link>
      <Link className={styles.tabLink} href="/chat">
        <span className={`${styles.iconWrap} ${isRouteActive("/chat") ? styles.activeIcon : ""}`}>
          <Image src="/icon-chat.svg" alt="Чат" width={24} height={24} loading="eager" />
          {unreadCount > 0 ? (
            <span className={styles.unreadBadge} aria-label={`Непрочитанных сообщений: ${unreadCount}`}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </span>
      </Link>
      <Link className={styles.tabLink} href="/profile">
        <span className={`${styles.iconWrap} ${isRouteActive("/profile") ? styles.activeIcon : ""}`}>
          <Image src="/icon-profile.svg" alt="Профиль" width={24} height={24} />
        </span>
      </Link>
    </nav>
  )
}
