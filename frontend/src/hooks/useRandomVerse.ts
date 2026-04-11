"use client"

import { useCallback, useState } from "react"
import { useTranslations } from "next-intl"
import { fetchRandomVerse } from "@/lib/bibleApi"

export interface RandomVerse {
  book: string
  chapter: number
  verse: number | string
  text: string
}

export function useRandomVerse() {
  const t = useTranslations("randomVerse")
  const [verse, setVerse] = useState<RandomVerse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getRandomVerse = useCallback(
    async (translation: string) => {
      setIsLoading(true)
      setError(null)

      try {
        const randomVerse = await fetchRandomVerse(translation)

        if (!randomVerse) {
          setError(t("fetchFailed"))
          setVerse(null)
          return
        }

        setVerse(randomVerse)
      } catch (err) {
        setError(err instanceof Error ? err.message : t("unknownError"))
        setVerse(null)
      } finally {
        setIsLoading(false)
      }
    },
    [t],
  )

  return { verse, isLoading, error, getRandomVerse }
}
