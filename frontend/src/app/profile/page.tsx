"use client"

import styles from "@/app/profile/profile.module.scss"
import { useAuth } from "@/hooks/useAuth"
import { formatMemberSince, getInitials } from "@/lib/utils"
import { getSavedVerses, deleteSavedVerse } from "@/lib/versesApi"
import { useEffect, useState } from "react"
import Link from "next/link"

type SavedVerse = {
  id: string
  book: string
  chapter: number
  verse: number
  text: string
  translation: string
  savedAt: string
}

type CatchError = Error & { message: string }

const Profile = () => {
  const { user, logout, loading } = useAuth({ redirectIfUnauthenticated: "/" })
  const [savedVerses, setSavedVerses] = useState<SavedVerse[]>([])
  const [versesLoading, setVersesLoading] = useState(false)
  const [versesError, setVersesError] = useState<string | null>(null)

  useEffect(() => {
    if (user?.id) {
      loadSavedVerses()
    }
  }, [user?.id])

  const loadSavedVerses = async () => {
    try {
      setVersesLoading(true)
      setVersesError(null)
      const verses = await getSavedVerses()
      setSavedVerses(Array.isArray(verses) ? verses : [])
    } catch (error) {
      const catchError = error as CatchError
      setVersesError(catchError.message || "Failed to load saved verses")
      setSavedVerses([])
    } finally {
      setVersesLoading(false)
    }
  }

  const handleDeleteVerse = async (verseId: string) => {
    try {
      await deleteSavedVerse(verseId)
      setSavedVerses((prev) => prev.filter((v) => v.id !== verseId))
    } catch (error) {
      const catchError = error as CatchError
      console.error("Failed to delete verse", catchError)
    }
  }

  if (loading || !user) {
    return null
  }

  const formattedDate = formatMemberSince(user?.createdAt)
  const initials = getInitials(user?.username)

  return (
    <>
      <section className={styles.profile}>
        <h1>Профиль</h1>

        <div className={styles.userInfo}>
          <div className={styles.avatar}>{initials}</div>
          <div className={styles.info}>
            <span className={styles.username}>{user?.username}</span>
            <span>Member since {formattedDate}</span>
          </div>
        </div>

        <ul className={styles.list}>
          <li className={styles.item}>Day Streak</li>
          <li className={styles.item}>Chapters</li>
          <li className={styles.item}>Badges</li>
        </ul>

        {/* SAVED VERSES SECTION */}
        <div className={styles.savedVersesSection}>
          <div className={styles.sectionHeader}>
            <span>Сохранённые стихи ({savedVerses.length})</span>
          </div>

          {versesLoading ? (
            <div className={styles.loading}>Загрузка...</div>
          ) : versesError ? (
            <div className={styles.error}>{versesError}</div>
          ) : savedVerses.length === 0 ? (
            <div className={styles.empty}>Нет сохранённых стихов</div>
          ) : (
            <div className={styles.versesList}>
              {savedVerses.map((verse) => (
                <div key={verse.id} className={styles.verseItem}>
                  <div className={styles.verseContent}>
                    <div className={styles.verseRef}>
                      <strong>{verse.book} {verse.chapter}:{verse.verse}</strong>
                      <span className={styles.translation}>{verse.translation}</span>
                    </div>
                    <p className={styles.verseText}>{verse.text}</p>
                    <span className={styles.savedDate}>
                      {new Date(verse.savedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDeleteVerse(verse.id)}
                    aria-label="Delete verse"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.account}>
          <span>Account</span>
          <ul>
            <li>Notifications</li>
            <li>Privacy & Security</li>
          </ul>
        </div>

        <div className={styles.support}>
          <span>Support</span>
          <ul>
            <li>Help Center </li>
            <li>About the App</li>
          </ul>

          <div>
            <Link
              href="/"
              onClick={(event) => {
                event.preventDefault()
                logout()
              }}
            >
              Sign Out
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}

export default Profile
