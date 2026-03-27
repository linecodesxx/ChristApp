import { Cormorant_Garamond, Inter, Geist_Mono, Playfair_Display } from "next/font/google"

export const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

/** Заголовки экрана «Заметки по стихам» (цифровой пергамент). */
export const playfairDisplay = Playfair_Display({
  variable: "--font-parchment-display",
  subsets: ["latin", "cyrillic"],
  display: "swap",
})

/** Обложки сборников: заголовок и описание на карточке. */
export const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant-garamond",
  subsets: ["latin", "cyrillic"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
})

export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})
