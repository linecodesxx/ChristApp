/** Ключ localStorage для TanStack Query Persist (скидати при logout). */
export const REACT_QUERY_PERSIST_KEY = "CHRISTAPP_RQ_CACHE_V2"

export function clearPersistedReactQueryCache() {
  try {
    if (typeof window === "undefined") return
    window.localStorage.removeItem(REACT_QUERY_PERSIST_KEY)
  } catch {
    // ігноруємо
  }
}
