import type { VerseNotesCollectionId } from "./verseNotesCollections"

export type VerseNoteRecord = {
  id: string
  collectionId: VerseNotesCollectionId
  createdAt: string
  /** Блок «Джерело»: цитата / вірш */
  sourceText: string
  /** Блок «Відгук»: особисті думки */
  responseText: string
}

function storageKey(userId: string, collectionId: VerseNotesCollectionId) {
  return `christapp:verse-notes:${userId}:${collectionId}`
}

function parseNotes(raw: string | null): VerseNoteRecord[] {
  if (!raw) {
    return []
  }
  try {
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) {
      return []
    }
    return data.filter((row): row is VerseNoteRecord => {
      return (
        typeof row === "object" &&
        row !== null &&
        typeof (row as VerseNoteRecord).id === "string" &&
        typeof (row as VerseNoteRecord).sourceText === "string" &&
        typeof (row as VerseNoteRecord).responseText === "string"
      )
    })
  } catch {
    return []
  }
}

export function loadVerseNotes(userId: string, collectionId: VerseNotesCollectionId): VerseNoteRecord[] {
  if (typeof window === "undefined") {
    return []
  }
  try {
    return parseNotes(localStorage.getItem(storageKey(userId, collectionId)))
  } catch {
    return []
  }
}

export function saveVerseNotes(
  userId: string,
  collectionId: VerseNotesCollectionId,
  notes: VerseNoteRecord[],
): void {
  if (typeof window === "undefined") {
    return
  }
  try {
    localStorage.setItem(storageKey(userId, collectionId), JSON.stringify(notes))
  } catch {
    // quota / private mode
  }
}

export function createVerseNoteId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `vn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function appendVerseNote(
  userId: string,
  collectionId: VerseNotesCollectionId,
  sourceText: string,
  responseText: string,
): VerseNoteRecord {
  const prev = loadVerseNotes(userId, collectionId)
  const note: VerseNoteRecord = {
    id: createVerseNoteId(),
    collectionId,
    createdAt: new Date().toISOString(),
    sourceText: sourceText.trim(),
    responseText: responseText.trim(),
  }
  saveVerseNotes(userId, collectionId, [note, ...prev])
  return note
}

export function deleteVerseNote(
  userId: string,
  collectionId: VerseNotesCollectionId,
  noteId: string,
): void {
  const prev = loadVerseNotes(userId, collectionId)
  saveVerseNotes(
    userId,
    collectionId,
    prev.filter((n) => n.id !== noteId),
  )
}
