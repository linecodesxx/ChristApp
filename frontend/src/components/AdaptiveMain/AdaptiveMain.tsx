"use client"

import styles from "@/app/layout.module.scss"
import { useTabBarOverlayOptional } from "@/contexts/TabBarOverlayContext"
import { chatComposerTabLayoutMediaQuery, useMediaQuery } from "@/hooks/useMediaQuery"

export default function AdaptiveMain({ children }: { children: React.ReactNode }) {
  const overlay = useTabBarOverlayOptional()
  const narrowForChatComposer = useMediaQuery(chatComposerTabLayoutMediaQuery())
  const composerFocused = overlay?.chatComposerFocused ?? false
  const relaxMainForKeyboard = composerFocused && narrowForChatComposer

  return (
    <main className={`${styles.main} ${relaxMainForKeyboard ? styles.mainComposerFocused : ""}`}>{children}</main>
  )
}
