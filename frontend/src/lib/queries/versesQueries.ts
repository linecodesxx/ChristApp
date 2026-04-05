import { getSavedVerses } from "@/lib/versesApi"

export function savedVersesQueryKey() {
  return ["verses", "saved"] as const
}

export function fetchSavedVersesForQuery() {
  return getSavedVerses()
}
