export type VerseNotesCollectionId =
  | "gratitude"
  | "love"
  | "prayer-diary"
  | "weekly-insights"
  | "sermons"

export type VerseNotesCollectionMeta = {
  id: VerseNotesCollectionId
  /** Заголовок на обложке-сборнике */
  title: string
  /** Короткая подпись под названием */
  tagline: string
  /** Класс фона карточки (см. CollectionCoverCard.module.scss) */
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
    id: "love",
    title: "Стихи о любви",
    tagline: "Любовь Бога и ближнего",
    coverVariant: "love",
  },
  {
    id: "prayer-diary",
    title: "Молитвенный дневник",
    tagline: "Записи разговора с Ним",
    coverVariant: "prayer",
  },
  {
    id: "weekly-insights",
    title: "Озарения недели",
    tagline: "Короткие откровения и мысли",
    coverVariant: "insights",
  },
  {
    id: "sermons",
    title: "Проповеди",
    tagline: "Тезисы, цитаты и отклик на слово служителя",
    coverVariant: "sermons",
  },
]

const COLLECTION_IDS = new Set(VERSE_NOTES_COLLECTIONS.map((c) => c.id))

export function isVerseNotesCollectionId(value: string): value is VerseNotesCollectionId {
  return COLLECTION_IDS.has(value as VerseNotesCollectionId)
}

export function getCollectionMeta(id: string): VerseNotesCollectionMeta | undefined {
  return VERSE_NOTES_COLLECTIONS.find((c) => c.id === id)
}
