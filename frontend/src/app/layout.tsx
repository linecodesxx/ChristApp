import { inter, geistMono, bodoniModa } from "@/styles/fonts"
import "@/styles/globals.scss"
import type { ReactNode } from "react"

/**
 * Кореневий layout: шрифти та глобальні стилі. Локалізована оболонка — у `app/[locale]/layout.tsx`.
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
