"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { canSeeVerseNotesNav } from "@/lib/verseNotesNav"
import {
  getCollectionMeta,
  isVerseNotesCollectionId,
  type VerseNotesCollectionId,
} from "@/lib/verseNotesCollections"
import { appendVerseNote, loadVerseNotes, type VerseNoteRecord } from "@/lib/verseNotesStorage"
import NoteScene from "@/components/NoteScene/NoteScene"
import PremiumNote from "@/components/VerseNotes/PremiumNote"
import PremiumNoteForm from "@/components/VerseNotes/PremiumNoteForm"
import styles from "../verse-notes.module.scss"

export default function VerseNotesCollectionPage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading } = useAuth()
  const rawId = typeof params?.collectionId === "string" ? params.collectionId : ""

  const collectionId = useMemo((): VerseNotesCollectionId | null => {
    return isVerseNotesCollectionId(rawId) ? rawId : null
  }, [rawId])

  const meta = collectionId ? getCollectionMeta(collectionId) : undefined

  const [notes, setNotes] = useState<VerseNoteRecord[]>([])
  const [noteSceneOpen, setNoteSceneOpen] = useState(false)
  const [noteSceneDraft, setNoteSceneDraft] = useState("")
  const noteSceneDraftRef = useRef(noteSceneDraft)
  useEffect(() => {
    noteSceneDraftRef.current = noteSceneDraft
  }, [noteSceneDraft])
  const [parchmentAppend, setParchmentAppend] = useState<string | null>(null)

  const reload = useCallback(() => {
    if (!user?.id || !collectionId) {
      return
    }
    setNotes(loadVerseNotes(user.id, collectionId))
  }, [user, collectionId])

  useEffect(() => {
    if (loading) {
      return
    }
    if (!user || !canSeeVerseNotesNav(user.username)) {
      router.replace("/bible")
      return
    }
    if (!collectionId || !meta) {
      router.replace("/verse-notes")
      return
    }
    reload()
  }, [user, loading, router, collectionId, meta, reload])

  const handleAdd = useCallback(
    (source: string, response: string) => {
      if (!user?.id || !collectionId) {
        return
      }
      appendVerseNote(user.id, collectionId, source, response)
      reload()
    },
    [user, collectionId, reload],
  )

  const saveNoteScene = useCallback(() => {
    setNoteSceneOpen(false)
    const t = noteSceneDraftRef.current.trim()
    if (t) {
      setParchmentAppend(t)
    }
    setNoteSceneDraft("")
  }, [])

  const consumeParchmentAppend = useCallback(() => {
    setParchmentAppend(null)
  }, [])

  if (loading || !user || !canSeeVerseNotesNav(user.username) || !collectionId || !meta) {
    return null
  }

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb}>
        <Link href="/verse-notes" className={styles.backLink}>
          ← Сборники и записи
        </Link>
      </nav>

      <header className={styles.collectionHeader}>
        <p className={styles.kicker}>Сборник</p>
        <h1 className={styles.title}>{meta.title}</h1>
        <p className={styles.subtitle}>{meta.tagline}</p>
      </header>

      <section className={styles.section} aria-labelledby="new-note-heading">
        <h2 id="new-note-heading" className={styles.sectionTitle}>
          Новая заметка
        </h2>
        <div className={styles.parchmentSceneRow}>
          <button
            type="button"
            className={styles.parchmentSceneBtn}
            onClick={() => setNoteSceneOpen(true)}
          >
            Сцена пергамента
          </button>
        </div>
        <div className={styles.noteFormShell}>
          <PremiumNoteForm
            onSubmit={handleAdd}
            appendToResponse={parchmentAppend}
            onAppendConsumed={consumeParchmentAppend}
          />
        </div>
      </section>

      <NoteScene
        isOpen={noteSceneOpen}
        onSave={saveNoteScene}
        value={noteSceneDraft}
        onChange={setNoteSceneDraft}
        ariaLabel="Текст заметки в сцене пергамента"
        placeholder="Пишите отклик при свете свечи…"
      />

      <section className={styles.section} aria-labelledby="notes-list-heading">
        <h2 id="notes-list-heading" className={styles.sectionTitle}>
          Записи
        </h2>
        {notes.length === 0 ? (
          <p className={styles.emptyNotes}>Пока нет заметок — добавьте первую выше.</p>
        ) : (
          <ul className={styles.notesList}>
            {notes.map((note) => (
              <li key={note.id}>
                <PremiumNote sourceText={note.sourceText} responseText={note.responseText} createdAt={note.createdAt} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
