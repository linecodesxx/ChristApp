import { fetchRandomVerse } from "@/lib/bibleApi"

export type DailyBreadVerse = {
  book: string
  chapter: number
  verse: string | number
  text: string
}

/** Один ключ на сессию кэша; staleTime сутки — «хлеб дня» не перезапрашивается при каждом заходе. */
export const dailyBreadQueryKey = ["daily-bread"] as const

export async function fetchDailyBreadForQuery(): Promise<DailyBreadVerse | null> {
  return fetchRandomVerse("NRT")
}
