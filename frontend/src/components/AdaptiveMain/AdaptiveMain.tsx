"use client"

import styles from "@/app/layout.module.scss"
import { useTabBarOverlayOptional } from "@/contexts/TabBarOverlayContext"

export default function AdaptiveMain({ children }: { children: React.ReactNode }) {
  const overlay = useTabBarOverlayOptional()
  const composerFocused = overlay?.chatComposerFocused ?? false
  return (
    <main className={`${styles.main} ${composerFocused ? styles.mainComposerFocused : ""}`}>{children}</main>
  )
}
