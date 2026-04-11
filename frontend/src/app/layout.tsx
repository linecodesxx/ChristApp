import { inter, geistMono, bodoniModa } from "@/styles/fonts"
import "@/styles/globals.scss"
import type { ReactNode } from "react"

/**
 * Корневой layout: шрифты и глобальные стили. Локализованная оболочка — в `app/[locale]/layout.tsx`.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="dark">
      <body
        className={`${inter.variable} ${geistMono.variable} ${bodoniModa.variable}`}
      >
        {children}
      </body>
    </html>
  )
}
