"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import { useState } from "react"

const ReactQueryDevtools = dynamic(
  () => import("@tanstack/react-query-devtools").then((d) => d.ReactQueryDevtools),
  { ssr: false },
)

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} />
      ) : null}
    </QueryClientProvider>
  )
}