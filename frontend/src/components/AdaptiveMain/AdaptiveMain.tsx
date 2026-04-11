"use client"

import styles from "@/app/layout.module.scss"
import { useTabBarOverlayOptional } from "@/contexts/TabBarOverlayContext"
import { chatComposerTabLayoutMediaQuery, useMediaQuery } from "@/hooks/useMediaQuery"
import { usePathname } from "@/i18n/navigation"

export default function AdaptiveMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const overlay = useTabBarOverlayOptional()
  const narrowForChatComposer = useMediaQuery(chatComposerTabLayoutMediaQuery())
  const composerFocused = overlay?.chatComposerFocused ?? false
  const relaxMainForKeyboard = composerFocused && narrowForChatComposer
  const isActiveChatRoom = pathname.startsWith("/chat/")
  const isOfflineRoute = pathname === "/offline"

  return (
    <main
      className={`${styles.main} ${isOfflineRoute ? styles.mainOffline : ""} ${relaxMainForKeyboard ? styles.mainComposerFocused : ""} ${isActiveChatRoom && !relaxMainForKeyboard ? styles.mainChatRoom : ""}`}
    >
      {children}
    </main>
  )
}
