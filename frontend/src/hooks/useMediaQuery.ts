"use client"

import { useSyncExternalStore } from "react"

/** Фокус у композері чату приховує нижній таб лише при ширині ≤ цього значення (десктоп ширший). */
export const CHAT_COMPOSER_TAB_LAYOUT_MAX_WIDTH_PX = 1023

export function chatComposerTabLayoutMediaQuery(): string {
  return `(max-width: ${CHAT_COMPOSER_TAB_LAYOUT_MAX_WIDTH_PX}px)`
}

/**
 * Підписка на `matchMedia`. На SSR і під час гідрації — `getServerSnapshot` (за замовчуванням `false`),
 * щоб не ламати гідрацію; для логіки «лише з фокусом» це безпечно.
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
