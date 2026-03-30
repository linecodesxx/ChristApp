"use client"

import styles from "@/app/layout.module.scss"
import { useTabBarOverlayOptional } from "@/contexts/TabBarOverlayContext"
import { chatComposerTabLayoutMediaQuery, useMediaQuery } from "@/hooks/useMediaQuery"
import { usePathname } from "next/navigation"

export default function AdaptiveMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const overlay = useTabBarOverlayOptional()
  const narrowForChatComposer = useMediaQuery(chatComposerTabLayoutMediaQuery())
  const composerFocused = overlay?.chatComposerFocused ?? false
  const relaxMainForKeyboard = composerFocused && narrowForChatComposer
  const isActiveChatRoom = pathname.startsWith("/chat/")

  return (
    <main
      className={`${styles.main} ${relaxMainForKeyboard ? styles.mainComposerFocused : ""} ${isActiveChatRoom && !relaxMainForKeyboard ? styles.mainChatRoom : ""}`}
    >
      {children}
    </main>
  )
}
