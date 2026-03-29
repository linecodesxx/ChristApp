import { EB_Garamond, Inter, Geist_Mono } from "next/font/google"

export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

/** Сцена «древний пергамент» (NoteScene). */
export const ebGaramond = EB_Garamond({
  variable: "--font-note-scene-eb-garamond",
  subsets: ["latin", "cyrillic"],
  display: "swap",
})

export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})
