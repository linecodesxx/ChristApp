"use client"

import styles from "@/app/profile/profile.module.scss"
import { useAuth } from "@/hooks/useAuth"
import { formatMemberSince, getInitials } from "@/lib/utils"
import { getSavedVerses, deleteSavedVerse } from "@/lib/versesApi"
import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"

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

  useEffect(() => {
    loadSavedVerses()
  }, [])

  const loadSavedVerses = async () => {
    setVersesLoading(true)
    const verses = await getSavedVerses()
    setSavedVerses(verses)
    setVersesLoading(false)
  }

  const handleDeleteVerse = async (verseId: string) => {
    await deleteSavedVerse(verseId)
    setSavedVerses((prev) => prev.filter((v) => v.id !== verseId))
  }

  const formattedDate = formatMemberSince(user?.createdAt)
  const initials = getInitials(user?.username)

  return (
    <section className={styles.profile}>
      <div className={styles.header}>
        <h1>Профиль</h1>
        <Image className={styles.settingsIcon} src={"/icon-settings.svg"} alt="Profile" width={24} height={24} />
      </div>

      <div className={styles.userInfo}>
        <div className={styles.avatar}>{initials}</div>
        <div className={styles.info}>
          <span className={styles.username}>{user?.username}</span>
          <span>Member since {formattedDate}</span>
        </div>
      </div>

      <ul className={styles.list}>
        <li className={styles.item}>
          <Image className={styles.imgIcon} src={"/icon-fire.svg"} alt="Day Streak" width={16} height={16} />
          <span>12</span>
          <p>Day Streak</p>
        </li>
        <li className={styles.item}>
          <Image className={styles.imgIcon} src={"/icon-chapters.svg"} alt="Chapters" width={16} height={16} />
          <span>48</span>
          <p>Chapters</p>
        </li>
        <li className={styles.item}>
          <Image className={styles.imgIcon} src={"/icon-badge.svg"} alt="Badges" width={16} height={16} />
          <span>5</span>
          <p>Badges</p>
        </li>
      </ul>

      {/* SAVED VERSES SECTION */}
      <div className={styles.savedVersesSection}>
        <div className={styles.sectionHeader}>
          <span>Сохранённые стихи ({savedVerses.length})</span>
        </div>

        {versesLoading ? (
          <div className={styles.loading}>Загрузка...</div>
        ) : savedVerses.length === 0 ? (
          <div className={styles.empty}>Нет сохранённых стихов</div>
        ) : (
          <div className={styles.versesList}>
            {savedVerses.map((verse) => (
              <div key={verse.id} className={styles.verseItem}>
                <div className={styles.verseContent}>
                  <div className={styles.verseRef}>
                    <strong>
                      {verse.book} {verse.chapter}:{verse.verse}
                    </strong>
                    <span className={styles.translation}>{verse.translation}</span>
                  </div>
                  <p className={styles.verseText}>{verse.text}</p>
                  <span className={styles.savedDate}>{new Date(verse.savedAt).toLocaleDateString()}</span>
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

      <div className={styles.support}>
        <span>Support</span>
        <ul>
          <li>
            <Link href="/contacts">Contacts</Link>
          </li>
          <li>
            <Link href="/about">About the App</Link>
          </li>
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

      <div className={styles.appVersion}>
        <span>App Version 1.00</span>
        <span>Authors: Ed Hristov, Xho Hristov</span>
      </div>
    </section>
  )
}

export default Profile
