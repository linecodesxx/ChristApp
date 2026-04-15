"use client"

import { useEffect } from "react"
import { useRouter } from "@/i18n/navigation"
import { useAuth } from "@/hooks/useAuth"
import { canSeeVerseNotesNav } from "@/lib/verseNotesNav"
import { VERSE_NOTES_COLLECTIONS } from "@/lib/verseNotesCollections"
import CollectionCoverCard from "@/components/VerseNotes/CollectionCoverCard"
import styles from "./verse-notes.module.scss"

export default function VerseNotesPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) {
      return
    }
    if (!user || !canSeeVerseNotesNav(user.username)) {
      router.replace("/bible")
    }
  }, [user, loading, router])

  if (loading || !user || !canSeeVerseNotesNav(user.username)) {
    return null
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Заметки по стихам</p>
        <h1 className={styles.title}>Сборники и записи</h1>
        <p className={styles.subtitle}>
          Выберите тему — внутри вы добавляете заметки из двух частей: источник (стих или цитата) и личный отклик.
        </p>
      </header>

      <ul className={styles.collectionsGrid}>
        {VERSE_NOTES_COLLECTIONS.map((collection) => (
          <li key={collection.id}>
            <CollectionCoverCard collection={collection} />
          </li>
        ))}
      </ul>
    </div>
  )
}
