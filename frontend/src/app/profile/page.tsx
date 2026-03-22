"use client"

import styles from "@/app/profile/profile.module.scss"
import { useAuth } from "@/hooks/useAuth"
import { formatMemberSince, getInitials } from "@/lib/utils"
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl"
import { getSavedVerses, deleteSavedVerse } from "@/lib/versesApi"
import { getApiErrorMessage } from "@/lib/apiError"
import { USERNAME_REGEX } from "@/lib/formValidation"
import PushNotificationCenter from "@/components/PushNotificationCenter/PushNotificationCenter"
import { getAuthToken } from "@/lib/auth"
import { requestNotificationPermissionIfNeeded } from "@/lib/notifications"
import {
  fetchPushStatus,
  getPushSyncErrorMessage,
  isPushSupportedInBrowser,
  syncBrowserPushSubscription,
} from "@/lib/push"
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { useHydrated } from "@/hooks/useHydrated"
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
  const hydrated = useHydrated()
  const { user, logout, refreshSession } = useAuth({ redirectIfUnauthenticated: "/" })
  const [savedVerses, setSavedVerses] = useState<SavedVerse[]>([])
  const [versesLoading, setVersesLoading] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [pushPermission, setPushPermission] = useState<PushPermissionState>("unsupported")
  const [isPushConfigured, setIsPushConfigured] = useState(false)
  const [hasPushSubscription, setHasPushSubscription] = useState(false)
  const [pushSyncErrorMessage, setPushSyncErrorMessage] = useState<string | null>(null)
  const [isPushLoading, setIsPushLoading] = useState(false)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const avatarFileRef = useRef<HTMLInputElement | null>(null)
  const [isAvatarUploading, setIsAvatarUploading] = useState(false)
  const [nickEdit, setNickEdit] = useState("")
  const [handleEdit, setHandleEdit] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)

  useEffect(() => {
    setPushPermission(getPushPermissionState())
  }, [])

  useEffect(() => {
    loadSavedVerses()
  }, [])

  useEffect(() => {
    if (!user) {
      return
    }
    setNickEdit(user.nickname ?? user.username)
    setHandleEdit(user.username)
  }, [user])

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
  const initials = getInitials(user?.nickname ?? user?.username)
  const avatarPhotoSrc = resolvePublicAvatarUrl(user?.avatarUrl)

  const API_URL = process.env.NEXT_PUBLIC_API_URL

  const MAX_AVATAR_BYTES = 5 * 1024 * 1024

  const handleAvatarFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !API_URL) return

    if (!file.type.startsWith("image/")) {
      window.alert("Выберите файл изображения.")
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      window.alert("Файл слишком большой. Максимум 5 МБ.")
      return
    }

    setIsAvatarUploading(true)
    try {
      const token = getAuthToken()
      if (!token) return

      const formData = new FormData()
      formData.append("avatar", file)

      const response = await fetch(`${API_URL}/users/me/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!response.ok) {
        window.alert("Не удалось загрузить фото. Подойдёт любое изображение до 5 МБ.")
        return
      }

      await refreshSession()
    } finally {
      setIsAvatarUploading(false)
    }
  }

  const toggleSettingsMenu = () => setIsSettingsOpen((prev) => !prev)

  const closeSettingsMenu = () => setIsSettingsOpen(false)

  const pushHint = useMemo(() => {
    if (!hydrated) {
      return "\u2014"
    }

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
  }, [hydrated, hasPushSubscription, isPushConfigured, isPushLoading, pushPermission, pushSyncErrorMessage])

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

  const handleSaveProfile = async () => {
    if (!API_URL || !user) {
      return
    }

    const token = getAuthToken()
    if (!token) {
      return
    }

    const nextNick = nickEdit.trim()
    const nextHandle = handleEdit.trim().toLowerCase()

    if (!nextNick) {
      window.alert("Введите ник")
      return
    }

    if (!USERNAME_REGEX.test(nextHandle)) {
      window.alert("@username: 3–20 символов, латиница, цифры и _")
      return
    }

    const body: { nickname?: string; username?: string } = {}
    if (nextNick !== (user.nickname ?? user.username)) {
      body.nickname = nextNick
    }
    if (nextHandle !== user.username) {
      body.username = nextHandle
    }

    if (Object.keys(body).length === 0) {
      return
    }

    setProfileSaving(true)
    try {
      const response = await fetch(`${API_URL}/users/me`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        window.alert(getApiErrorMessage(errData, "Не удалось сохранить"))
        return
      }

      await refreshSession()
    } finally {
      setProfileSaving(false)
    }
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
              <span className={styles.menuHint}>Ниже</span>
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
        <input
          ref={avatarFileRef}
          type="file"
          accept="image/*"
          className={styles.avatarFileInput}
          aria-hidden
          tabIndex={-1}
          onChange={(event) => void handleAvatarFile(event)}
        />
        <button
          type="button"
          className={styles.avatarButton}
          onClick={() => avatarFileRef.current?.click()}
          disabled={isAvatarUploading}
          aria-label={avatarPhotoSrc ? "Сменить фото профиля" : "Загрузить фото профиля"}
        >
          {avatarPhotoSrc ? (
            <Image
              src={avatarPhotoSrc}
              alt=""
              width={60}
              height={60}
              className={styles.avatarImage}
              unoptimized
            />
          ) : (
            <span className={styles.avatarInitials}>{initials}</span>
          )}
        </button>
        <div className={styles.info}>
          <span className={styles.username}>{user?.nickname ?? user?.username}</span>
          <span className={styles.userHandle}>@{user?.username}</span>
          <span>С нами с {formattedDate}</span>
        </div>
      </div>

      <div className={styles.profileEdit}>
        <label className={styles.profileLabel}>
          Ник
          <input
            className={styles.profileInput}
            value={nickEdit}
            onChange={(event) => setNickEdit(event.target.value)}
            autoComplete="nickname"
            maxLength={40}
          />
        </label>
        <label className={styles.profileLabel}>
          @username
          <input
            className={styles.profileInput}
            value={handleEdit}
            onChange={(event) => setHandleEdit(event.target.value)}
            autoComplete="username"
            spellCheck={false}
            maxLength={20}
          />
        </label>
        <button
          type="button"
          className={styles.profileSave}
          onClick={() => void handleSaveProfile()}
          disabled={profileSaving}
        >
          {profileSaving ? "Сохранение…" : "Сохранить"}
        </button>
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
          <div className={styles.versesLoadingWrap}>
            Loading...
          </div>
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
                  <span className={styles.savedDate}>
                    {hydrated
                      ? new Date(verse.savedAt).toLocaleDateString("ru-RU")
                      : "\u2014"}
                  </span>
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
