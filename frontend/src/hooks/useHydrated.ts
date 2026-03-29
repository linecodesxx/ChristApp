"use client"

import { useSyncExternalStore } from "react"

/**
 * `false` на сервере и при гидрации; `true` после монтирования на клиенте.
 * Реализация через useSyncExternalStore — без расхождений SSR/клиента (см. getServerSnapshot).
 * `queueMicrotask` в subscribe гарантирует повторный рендер после commit (пустой subscribe в React 19 может не дать обновления).
 */
export function useHydrated() {
  return useSyncExternalStore(
    (onStoreChange) => {
      queueMicrotask(onStoreChange)
      return () => {}
    },
    () => true,
    () => false,
  )
}
