import { globalSeo } from "@/seo/global.seo"
import { inter, geistMono } from "@/styles/fonts"
import "@/styles/globals.scss"
import AdaptiveMain from "@/components/AdaptiveMain/AdaptiveMain"
import TabBar from "@/components/TabBar/TabBar"
import ThemeToggle from "@/components/ThemeToggle/ThemeToggle"
import PwaRegistration from "@/components/PwaRegistration/PwaRegistration"
import PushAutoSync from "@/components/PushAutoSync/PushAutoSync"
import PresenceSocket from "@/components/PresenceSocket/PresenceSocket"
import Providers from "@/providers/providers"
import SplashScreen from "@/components/SplashScreen/SplashScreen"

import type { Metadata, Viewport } from "next"

export const metadata: Metadata = globalSeo

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdf8f0" },
    { media: "(prefers-color-scheme: dark)", color: "#2e2d2d" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" data-theme="dark">
      <body className={`${inter.variable} ${geistMono.variable}`}>
        <SplashScreen />
        <Providers>
        <PwaRegistration />
        <PushAutoSync />
        <PresenceSocket>
          <ThemeToggle />
          <AdaptiveMain>{children}</AdaptiveMain>
          <TabBar />
          </PresenceSocket>
        </Providers>
      </body>
    </html>
  )
}
