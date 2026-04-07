"use client"

import { TabBarOverlayProvider } from "@/contexts/TabBarOverlayContext"
import { REACT_QUERY_PERSIST_KEY } from "@/lib/queryPersistConstants"
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister"
import { QueryClient } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { useState } from "react"

const noopStorage: Storage = {
  get length() {
    return 0
  },
  clear() {},
  getItem() {
    return null
  },
  key() {
    return null
  },
  removeItem() {},
  setItem() {},
}

function shouldPersistQuery(query: { queryKey: readonly unknown[] }) {
  const root = query.queryKey[0]
  /** Push/unread — персонально и часто меняется; персист давал пустые превью/бейджи после загрузки. */
  if (root === "push") {
    return false
  }
  return (
    root === "chapter" ||
    root === "bible" ||
    root === "chat" ||
    root === "verses" ||
    root === "users" ||
    root === "auth"
  )
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
            /** Плавный UX: при refetch показываем предыдущие данные (аналог stale-while-revalidate на уровне UI). */
            placeholderData: (prev: unknown) => prev,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  )

  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : noopStorage,
      key: REACT_QUERY_PERSIST_KEY,
      throttleTime: 1000,
    }),
  )

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        /** Согласовано с gcTime статичных запросов Библии (7 дней). */
        maxAge: 1000 * 60 * 60 * 24 * 7,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" && shouldPersistQuery(query),
        },
      }}
    >
      <TabBarOverlayProvider>{children}</TabBarOverlayProvider>
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools buttonPosition="bottom-left" />
      ) : null}
    </PersistQueryClientProvider>
  )
}
