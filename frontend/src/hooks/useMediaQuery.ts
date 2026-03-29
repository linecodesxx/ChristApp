"use client"

import { useSyncExternalStore } from "react"

/** Фокус в композере чата скрывает нижний таб только при ширине ≤ этого значения (десктоп шире). */
export const CHAT_COMPOSER_TAB_LAYOUT_MAX_WIDTH_PX = 1023

export function chatComposerTabLayoutMediaQuery(): string {
  return `(max-width: ${CHAT_COMPOSER_TAB_LAYOUT_MAX_WIDTH_PX}px)`
}

/**
 * Подписка на `matchMedia`. На SSR и при гидрации — `getServerSnapshot` (по умолчанию `false`),
 * чтобы не ломать гидрацию; для логики «только с фокусом» это безопасно.
 */
export function useMediaQuery(query: string, serverMatches = false): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mq = window.matchMedia(query)
      mq.addEventListener("change", onStoreChange)
      return () => mq.removeEventListener("change", onStoreChange)
    },
    () => window.matchMedia(query).matches,
    () => serverMatches,
  )
}
