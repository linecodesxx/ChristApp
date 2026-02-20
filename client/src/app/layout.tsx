import { globalSeo } from "@/seo/global.seo"
import { inter, geistMono } from "@/styles/fonts"
import styles from "./layout.module.scss"
import "@/styles/globals.scss"
import TabBar from "@components/TabBar"
import { Metadata } from "next"

export const metadata: Metadata = globalSeo

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru">
      <body className={`${inter.variable} ${geistMono.variable}`}>
        <main className={styles.main}>{children}</main>
        <TabBar />
      </body>
    </html>
  )
}
