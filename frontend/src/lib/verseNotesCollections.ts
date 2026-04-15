export type VerseNotesCollectionId =
  | "gratitude"
  | "love"
  | "prayer-diary"
  | "weekly-insights"
  | "sermons"

export type VerseNotesCollectionMeta = {
  id: VerseNotesCollectionId
  title: string
  tagline: string
  /** Клас фону картки (див. CollectionCoverCard.module.scss) */
  coverVariant: "gratitude" | "love" | "prayer" | "insights" | "sermons"
}

export const VERSE_NOTES_COLLECTIONS: VerseNotesCollectionMeta[] = [
  {
    id: "gratitude",
    title: "Благодарность",
    tagline: "Стихи и строки о благодарности сердца",
    coverVariant: "gratitude",
  },
  {
    id: "weekly-insights",
    title: "Озарения недели",
    tagline: "Короткие откровения и мысли",
    coverVariant: "insights",
  },
]

const COLLECTION_IDS = new Set(VERSE_NOTES_COLLECTIONS.map((c) => c.id))

export function isVerseNotesCollectionId(value: string): value is VerseNotesCollectionId {
  return COLLECTION_IDS.has(value as VerseNotesCollectionId)
}

export function getCollectionMeta(id: string): VerseNotesCollectionMeta | undefined {
  return VERSE_NOTES_COLLECTIONS.find((c) => c.id === id)
}
