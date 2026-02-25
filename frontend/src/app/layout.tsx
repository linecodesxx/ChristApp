import { globalSeo } from "@/seo/global.seo"
import { inter, geistMono } from "@/styles/fonts"
import styles from "./layout.module.scss"
import "@/styles/globals.scss"
import TabBar from "@/components/TabBar/TabBar"
import ThemeToggle from "@/components/ThemeToggle/ThemeToggle"
import { Metadata } from "next"

export const metadata: Metadata = globalSeo

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" data-theme="dark">
      <body className={`${inter.variable} ${geistMono.variable}`}>
        <ThemeToggle />
        <main className={styles.main}>{children}</main>
        <TabBar />
      </body>
    </html>
  )
}
