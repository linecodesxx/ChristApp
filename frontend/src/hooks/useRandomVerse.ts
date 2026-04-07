import { useCallback, useState } from "react"
import { fetchRandomVerse } from "@/lib/bibleApi"

export interface RandomVerse {
  book: string
  chapter: number
  verse: number | string
  text: string
}

export function useRandomVerse() {
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
          setError("Не удалось получить случайный стих")
          setVerse(null)
          return
        }

        setVerse(randomVerse)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Неизвестная ошибка")
        setVerse(null)
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  return { verse, isLoading, error, getRandomVerse }
}
