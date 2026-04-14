import type { Metadata, Viewport } from "next"
import { notFound } from "next/navigation"
import { hasLocale, NextIntlClientProvider } from "next-intl"
import { getMessages, setRequestLocale } from "next-intl/server"
import AdaptiveMain from "@/components/AdaptiveMain/AdaptiveMain"
import AuthSessionSync from "@/components/AuthSessionSync/AuthSessionSync"
import HtmlLang from "@/components/HtmlLang/HtmlLang"
import PresenceSocket from "@/components/PresenceSocket/PresenceSocket"
import PwaInstallPrompt from "@/components/PwaInstallPrompt/PwaInstallPrompt"
import PwaRegistration from "@/components/PwaRegistration/PwaRegistration"
import PushAutoSync from "@/components/PushAutoSync/PushAutoSync"
import SplashScreen from "@/components/SplashScreen/SplashScreen"
import TabBar from "@/components/TabBar/TabBar"
import ThemeToggle from "@/components/ThemeToggle/ThemeToggle"
import { routing } from "@/i18n/routing"
import Providers from "@/providers/providers"
import { globalSeo } from "@/seo/global.seo"

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

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string }>
}>) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HtmlLang />
      <SplashScreen />
      <Providers>
        <AuthSessionSync />
        <PwaRegistration />
        <PwaInstallPrompt />
        <PushAutoSync />
        <PresenceSocket>
          <ThemeToggle />
          <AdaptiveMain>{children}</AdaptiveMain>
          <TabBar />
        </PresenceSocket>
      </Providers>
    </NextIntlClientProvider>
  )
}
