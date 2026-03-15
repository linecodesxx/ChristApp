"use client"

import styles from "@/app/profile/profile.module.scss"
import { useAuth } from "@/hooks/useAuth"
import { formatMemberSince, getInitials } from "@/lib/utils"
import { getSavedVerses, deleteSavedVerse } from "@/lib/versesApi"
import PushNotificationCenter from "@/components/PushNotificationCenter/PushNotificationCenter"
import { getAuthToken } from "@/lib/auth"
import { requestNotificationPermissionIfNeeded } from "@/lib/notifications"
import {
  fetchPushStatus,
  getPushSyncErrorMessage,
  isPushSupportedInBrowser,
  syncBrowserPushSubscription,
} from "@/lib/push"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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

type PushPermissionState = NotificationPermission | "unsupported"

function getPushPermissionState(): PushPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported"
  }

  return Notification.permission
}

const Profile = () => {
  const { user, logout } = useAuth({ redirectIfUnauthenticated: "/" })
  const [savedVerses, setSavedVerses] = useState<SavedVerse[]>([])
  const [versesLoading, setVersesLoading] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [pushPermission, setPushPermission] = useState<PushPermissionState>(getPushPermissionState)
  const [isPushConfigured, setIsPushConfigured] = useState(false)
  const [hasPushSubscription, setHasPushSubscription] = useState(false)
  const [pushSyncErrorMessage, setPushSyncErrorMessage] = useState<string | null>(null)
  const [isPushLoading, setIsPushLoading] = useState(false)
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

  const refreshPushState = useCallback(async () => {
    const permission = getPushPermissionState()
    setPushPermission(permission)

    const token = getAuthToken()
    if (!token || !isPushSupportedInBrowser()) {
      setIsPushConfigured(false)
      setHasPushSubscription(false)
      setPushSyncErrorMessage(null)
      return
    }

    const pushStatus = await fetchPushStatus(token)
    setIsPushConfigured(Boolean(pushStatus?.enabled))
    setHasPushSubscription(Boolean(pushStatus?.hasSubscription))
    if (pushStatus?.hasSubscription || !pushStatus?.enabled || permission !== "granted") {
      setPushSyncErrorMessage(null)
    }
  }, [])

  useEffect(() => {
    if (!isSettingsOpen) {
      return
    }

    void refreshPushState()
  }, [isSettingsOpen, refreshPushState])

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

  const pushHint = useMemo(() => {
    if (isPushLoading) {
      return "Проверка..."
    }

    if (!isPushSupportedInBrowser()) {
      return "Недоступно"
    }

    if (pushPermission === "default") {
      return "Нужно разрешение"
    }

    if (pushPermission === "denied") {
      return "Заблокировано"
    }

    if (pushSyncErrorMessage) {
      return pushSyncErrorMessage
    }

    if (!isPushConfigured) {
      return "Сервер не настроен"
    }

    return hasPushSubscription ? "Активно" : "Не подключено"
  }, [hasPushSubscription, isPushConfigured, isPushLoading, pushPermission, pushSyncErrorMessage])

  const handlePushSettings = useCallback(async () => {
    setIsPushLoading(true)

    try {
      const permission = await requestNotificationPermissionIfNeeded()
      setPushPermission(permission)

      if (permission !== "granted") {
        setPushSyncErrorMessage(null)
        await refreshPushState()
        return
      }

      const token = getAuthToken()
      if (token) {
        const syncResult = await syncBrowserPushSubscription(token)
        setPushSyncErrorMessage(syncResult.success ? null : getPushSyncErrorMessage(syncResult.reason))
      }

      await refreshPushState()
    } finally {
      setIsPushLoading(false)
    }
  }, [refreshPushState])

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

            <button type="button" className={styles.menuItem} role="menuitem" onClick={handlePushSettings}>
              <span>Уведомления</span>
              <span className={styles.menuHint}>{pushHint}</span>
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
        <Link className={styles.link} href="/contacts">
          Контакты и помощь
        </Link>
      </div>

      <PushNotificationCenter />

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
