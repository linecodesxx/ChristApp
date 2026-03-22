"use client"

import { useSyncExternalStore } from "react"

const emptySubscribe = () => () => {}

/**
 * `false` на сервере и при гидрации; `true` после монтирования на клиенте.
 * Реализация через useSyncExternalStore — без расхождений SSR/клиента (см. getServerSnapshot).
 */
export function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  )
}
