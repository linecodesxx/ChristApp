import { fetchRandomVerse } from "@/lib/bibleApi"

export type DailyBreadVerse = {
  book: string
  chapter: number
  verse: string | number
  text: string
}

export const dailyBreadQueryKey = (translation: string) => ["daily-bread", translation] as const

export async function fetchDailyBreadForQuery(translation: string): Promise<DailyBreadVerse | null> {
  return fetchRandomVerse(translation)
}
