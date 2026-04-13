"use client"

import { useSyncExternalStore } from "react"

/**
 * `false` на сервері й під час гідрації; `true` після монтування на клієнті.
 * Реалізація через useSyncExternalStore — без розбіжностей SSR/клієнта (див. getServerSnapshot).
 * `queueMicrotask` у subscribe гарантує повторний рендер після commit (порожній subscribe у React 19 може не дати оновлення).
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
