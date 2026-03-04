"use client"

import styles from "@/app/profile/profile.module.scss"
import { useAuth } from "@/hooks/useAuth"
import { formatMemberSince, getInitials } from "@/lib/utils"
import { getSavedVerses, deleteSavedVerse } from "@/lib/versesApi"
import { useEffect, useRef, useState } from "react"
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

const Profile = () => {
  const { user, logout } = useAuth({ redirectIfUnauthenticated: "/" })
  const [savedVerses, setSavedVerses] = useState<SavedVerse[]>([])
  const [versesLoading, setVersesLoading] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    loadSavedVerses()
  }, [])

  useEffect(() => {
    if (!isSettingsOpen) return

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (settingsRef.current && !settingsRef.current.contains(target)) {
        setIsSettingsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleOutsideClick)
    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [isSettingsOpen])

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

  const toggleSettingsMenu = () => setIsSettingsOpen((prev) => !prev)

  const closeSettingsMenu = () => setIsSettingsOpen(false)

  const handleLogoutFromMenu = () => {
    setIsSettingsOpen(false)
    logout()
  }

  return (
    <section className={styles.profile}>
      <div className={styles.header}>
        <h1>Профиль</h1>
        <div className={styles.settingsWrap} ref={settingsRef}>
          <button
            className={`${styles.settingsBtn} ${isSettingsOpen ? styles.settingsBtnActive : ""}`}
            id="settings"
            aria-label="Настройки"
            aria-haspopup="menu"
            aria-expanded={isSettingsOpen}
            aria-controls="settings-menu"
            onClick={toggleSettingsMenu}
            type="button"
          >
            <Image className={styles.settingsIcon} src={"/icon-settings.svg"} alt="Настройки" width={24} height={24} />
          </button>

          <div className={`${styles.settingsMenu} ${isSettingsOpen ? styles.show : ""}`} id="settings-menu" role="menu">
            <p className={styles.menuTitle}>Быстрые настройки</p>

            <button type="button" className={styles.menuItem} role="menuitem" onClick={closeSettingsMenu}>
              <span>Редактировать профиль</span>
              <span className={styles.menuHint}>Скоро</span>
            </button>

            <button type="button" className={styles.menuItem} role="menuitem" onClick={closeSettingsMenu}>
              <span>Уведомления</span>
              <span className={styles.menuHint}>Скоро</span>
            </button>

            <Link href="/contacts" className={styles.menuItem} role="menuitem" onClick={closeSettingsMenu}>
              <span>Контакты и помощь</span>
              <span className={styles.menuHint}>Открыть</span>
            </Link>

            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              role="menuitem"
              onClick={handleLogoutFromMenu}
            >
              <span>Выйти из аккаунта</span>
              <span className={styles.menuHint}>Сейчас</span>
            </button>
          </div>
        </div>
      </div>

      <div className={styles.userInfo}>
        <div className={styles.avatar}>{initials}</div>
        <div className={styles.info}>
          <span className={styles.username}>{user?.username}</span>
          <span>С нами с {formattedDate}</span>
        </div>
      </div>

      <ul className={styles.list}>
        <li className={styles.item}>
          <Image className={styles.imgIcon} src={"/icon-fire.svg"} alt="Серия дней" width={16} height={16} />
          <span>1</span>
          <p>Серия дней</p>
        </li>
        <li className={styles.item}>
          <Image className={styles.imgIcon} src={"/icon-chapters.svg"} alt="Главы" width={16} height={16} />
          <span>0</span>
          <p>Главы</p>
        </li>
        <li className={styles.item}>
          <Image className={styles.imgIcon} src={"/icon-badge.svg"} alt="Награды" width={16} height={16} />
          <span>0</span>
          <p>Награды</p>
        </li>
      </ul>

      {/* СЕКЦИЯ СОХРАНЁННЫХ СТИХОВ */}
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
                  aria-label="Удалить стих"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.support}>
        <Link className={styles.link} href="/contacts">Контакты и помощь</Link>
      </div>

      <div className={styles.signOut}>
        <div>
          <Link
            href="/"
            onClick={(event) => {
              event.preventDefault()
              logout()
            }}
          >
            Выйти из аккаунта
          </Link>
        </div>
      </div>
    </section>
  )
}

export default Profile
