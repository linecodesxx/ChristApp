"use client"

import styles from "@/app/profile/profile.module.scss"
import { useAuth } from "@/hooks/useAuth"
import { formatMemberSince, getInitials } from "@/lib/utils"
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback"
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl"
import { getAppStreak } from "@/lib/appStreak"
import { getSavedVerses, deleteSavedVerse } from "@/lib/versesApi"
import { getApiErrorMessage } from "@/lib/apiError"
import { USERNAME_REGEX } from "@/lib/formValidation"
import PushNotificationCenter from "@/components/PushNotificationCenter/PushNotificationCenter"
import { getAuthToken } from "@/lib/auth"
import {
  SUGGESTED_THEME_BACKGROUND,
  SUGGESTED_THEME_FOREGROUND,
  normalizeThemeFontKey,
  type ThemeFontKey,
} from "@/lib/userAppearance"
import { fetchPushStatus, isPushSupportedInBrowser } from "@/lib/push"
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

export default function ProfilePage() {
  const hydrated = useHydrated()
  const { user, logout, refreshSession } = useAuth({ redirectIfUnauthenticated: "/" })
  const [savedVerses, setSavedVerses] = useState<SavedVerse[]>([])
  const [versesLoading, setVersesLoading] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [pushPermission, setPushPermission] = useState<PushPermissionState>("unsupported")
  const [isPushConfigured, setIsPushConfigured] = useState(false)
  const [hasPushSubscription, setHasPushSubscription] = useState(false)
  const [pushSyncErrorMessage, setPushSyncErrorMessage] = useState<string | null>(null)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const avatarFileRef = useRef<HTMLInputElement | null>(null)
  const [isAvatarUploading, setIsAvatarUploading] = useState(false)
  const [nickEdit, setNickEdit] = useState("")
  const [handleEdit, setHandleEdit] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const [avatarCacheBust, setAvatarCacheBust] = useState(0)
  const [dayStreak, setDayStreak] = useState(0)
  const [themeFgInput, setThemeFgInput] = useState(SUGGESTED_THEME_FOREGROUND)
  const [themeBgInput, setThemeBgInput] = useState(SUGGESTED_THEME_BACKGROUND)
  const [themeFontInput, setThemeFontInput] = useState<ThemeFontKey>("inter")
  const [appearanceSaving, setAppearanceSaving] = useState(false)

  useEffect(() => {
    setPushPermission(getPushPermissionState())
  }, [])

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl)
      }
    }
  }, [avatarPreviewUrl])

  useEffect(() => {
    if (!user) {
      return
    }
    setDayStreak(getAppStreak())
  }, [user])

  useEffect(() => {
    if (!user) {
      return
    }
    let cancelled = false
    const load = async () => {
      setVersesLoading(true)
      try {
        const verses = await getSavedVerses()
        if (!cancelled) {
          setSavedVerses(verses)
        }
      } finally {
        if (!cancelled) {
          setVersesLoading(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      return
    }
    setNickEdit(user.nickname ?? user.username)
    setHandleEdit(user.username)
    setThemeFgInput(user.themeForegroundHex || SUGGESTED_THEME_FOREGROUND)
    setThemeBgInput(user.themeBackgroundHex || SUGGESTED_THEME_BACKGROUND)
    setThemeFontInput(normalizeThemeFontKey(user.themeFontKey))
  }, [user])

  useEffect(() => {
    if (!isNotificationsOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsNotificationsOpen(false)
      }
    }

    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [isNotificationsOpen])

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

  const handleDeleteVerse = async (verseId: string) => {
    await deleteSavedVerse(verseId)
    setSavedVerses((prev) => prev.filter((v) => v.id !== verseId))
  }

  const formattedDate = formatMemberSince(user?.createdAt)
  const initials = getInitials(user?.nickname ?? user?.username)
  const avatarPhotoSrc = useMemo(() => {
    if (avatarPreviewUrl) {
      return avatarPreviewUrl
    }
    const base = resolvePublicAvatarUrl(user?.avatarUrl)
    if (!base) {
      return undefined
    }
    if (avatarCacheBust) {
      return `${base}${base.includes("?") ? "&" : "?"}v=${avatarCacheBust}`
    }
    return base
  }, [avatarPreviewUrl, user?.avatarUrl, avatarCacheBust])

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

    setAvatarPreviewUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev)
      }
      return URL.createObjectURL(file)
    })

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
      setAvatarCacheBust(Date.now())
      setAvatarPreviewUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev)
        }
        return null
      })
    } finally {
      setIsAvatarUploading(false)
    }
  }

  const closeProfileEdit = () => {
    setShowProfileEdit(false)
  }

  const openProfileEditFromSettings = () => {
    closeSettingsMenu()
    setShowProfileEdit(true)
  }

  const toggleSettingsMenu = () => setIsSettingsOpen((prev) => !prev)

  const closeSettingsMenu = () => setIsSettingsOpen(false)

  const pushHint = useMemo(() => {
    if (!hydrated) {
      return "\u2014"
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
  }, [hydrated, hasPushSubscription, isPushConfigured, pushPermission, pushSyncErrorMessage])

  const openNotificationsFromMenu = useCallback(() => {
    setIsSettingsOpen(false)
    setIsNotificationsOpen(true)
    void refreshPushState()
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

    const hexFg = themeFgInput.trim().toLowerCase()
    const hexBg = themeBgInput.trim().toLowerCase()
    if (!/^#[0-9a-f]{6}$/.test(hexFg) || !/^#[0-9a-f]{6}$/.test(hexBg)) {
      window.alert("Цвета: выберите оттенки в палитре (формат #RRGGBB).")
      return
    }

    const body: {
      nickname?: string
      username?: string
      themeForegroundHex: string
      themeBackgroundHex: string
      themeFontKey: string
    } = {
      themeForegroundHex: hexFg,
      themeBackgroundHex: hexBg,
      themeFontKey: themeFontInput,
    }
    if (nextNick !== (user.nickname ?? user.username)) {
      body.nickname = nextNick
    }
    if (nextHandle !== user.username) {
      body.username = nextHandle
    }

    const userFg = (user.themeForegroundHex ?? "").toLowerCase()
    const userBg = (user.themeBackgroundHex ?? "").toLowerCase()
    const effFg = userFg || SUGGESTED_THEME_FOREGROUND.toLowerCase()
    const effBg = userBg || SUGGESTED_THEME_BACKGROUND.toLowerCase()
    const sameTheme =
      hexFg === effFg && hexBg === effBg && themeFontInput === normalizeThemeFontKey(user.themeFontKey)
    const sameNick = nextNick === (user.nickname ?? user.username)
    const sameHandle = nextHandle === user.username
    if (sameNick && sameHandle && sameTheme) {
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
      closeProfileEdit()
    } finally {
      setProfileSaving(false)
    }
  }

  const handleResetAppearance = async () => {
    if (!API_URL || !user) {
      return
    }
    const token = getAuthToken()
    if (!token) {
      return
    }

    setAppearanceSaving(true)
    try {
      const response = await fetch(`${API_URL}/users/me`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          themeForegroundHex: "",
          themeBackgroundHex: "",
          themeFontKey: "",
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        window.alert(getApiErrorMessage(errData, "Не удалось сбросить оформление"))
        return
      }

      await refreshSession()
      setThemeFgInput(SUGGESTED_THEME_FOREGROUND)
      setThemeBgInput(SUGGESTED_THEME_BACKGROUND)
      setThemeFontInput("inter")
    } finally {
      setAppearanceSaving(false)
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

            <button
              type="button"
              className={styles.menuItem}
              role="menuitem"
              onClick={openProfileEditFromSettings}
            >
              <span>Редактировать профиль</span>
              <span className={styles.menuHint}>Ник и @username</span>
            </button>

            <button type="button" className={styles.menuItem} role="menuitem" onClick={openNotificationsFromMenu}>
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
          <AvatarWithFallback
            src={avatarPhotoSrc ?? undefined}
            initials={initials}
            colorSeed={user?.id ?? "profile"}
            width={60}
            height={60}
            imageClassName={styles.avatarImage}
            fallbackClassName={styles.avatarInitials}
            fallbackTag="span"
            fallbackTint="onError"
          />
        </button>
        <div className={styles.info}>
          <span className={styles.username}>{user?.nickname ?? user?.username}</span>
          <span className={styles.userHandle}>@{user?.username}</span>
          <span>С нами с {formattedDate}</span>
        </div>
      </div>

      {showProfileEdit ? (
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

          <p className={styles.appearanceHint}>
            Фон и текст применяются поверх тёмной/светлой темы (лампочка). Pastah и Achiko лежат в{" "}
            <code>public/fonts/</code>; лицензии на вашей стороне.
          </p>
          <label className={styles.profileLabel}>
            Цвет текста
            <span className={styles.colorRow}>
              <input
                className={styles.colorInput}
                type="color"
                value={themeFgInput.startsWith("#") && themeFgInput.length === 7 ? themeFgInput : SUGGESTED_THEME_FOREGROUND}
                onChange={(event) => setThemeFgInput(event.target.value)}
                aria-label="Цвет текста"
              />
              <input
                className={styles.profileInput}
                value={themeFgInput}
                onChange={(event) => setThemeFgInput(event.target.value)}
                spellCheck={false}
                maxLength={7}
                placeholder={SUGGESTED_THEME_FOREGROUND}
              />
            </span>
          </label>
          <label className={styles.profileLabel}>
            Цвет фона
            <span className={styles.colorRow}>
              <input
                className={styles.colorInput}
                type="color"
                value={themeBgInput.startsWith("#") && themeBgInput.length === 7 ? themeBgInput : SUGGESTED_THEME_BACKGROUND}
                onChange={(event) => setThemeBgInput(event.target.value)}
                aria-label="Цвет фона"
              />
              <input
                className={styles.profileInput}
                value={themeBgInput}
                onChange={(event) => setThemeBgInput(event.target.value)}
                spellCheck={false}
                maxLength={7}
                placeholder={SUGGESTED_THEME_BACKGROUND}
              />
            </span>
          </label>
          <label className={styles.profileLabel}>
            Шрифт интерфейса
            <select
              className={styles.appearanceSelect}
              value={themeFontInput}
              onChange={(event) => setThemeFontInput(event.target.value as ThemeFontKey)}
            >
              <option value="inter">Inter (по умолчанию)</option>
              <option value="pastah">Pastah</option>
              <option value="achiko">Achiko</option>
            </select>
          </label>

          <div className={styles.profileEditActions}>
            <button
              type="button"
              className={styles.profileCancel}
              onClick={closeProfileEdit}
              disabled={profileSaving}
            >
              Отмена
            </button>
            <button
              type="button"
              className={styles.profileSave}
              onClick={() => void handleSaveProfile()}
              disabled={profileSaving || appearanceSaving}
            >
              {profileSaving ? "Сохранение…" : "Сохранить"}
            </button>
            <button
              type="button"
              className={styles.profileCancel}
              onClick={() => void handleResetAppearance()}
              disabled={profileSaving || appearanceSaving}
            >
              {appearanceSaving ? "Сброс…" : "Сбросить оформление"}
            </button>
          </div>
        </div>
      ) : null}

      <ul className={styles.list}>
        <li className={styles.item}>
          <Image className={styles.imgIcon} src={"/icon-fire.svg"} alt="Серия дней" width={16} height={16} />
          <span>{dayStreak}</span>
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

      {isNotificationsOpen ? (
        <div className={styles.notificationsPanel}>
          <div className={styles.notificationsPanelHeader}>
            <h2 className={styles.notificationsTitle}>Уведомления</h2>
            <button
              type="button"
              className={styles.notificationsClose}
              onClick={() => setIsNotificationsOpen(false)}
              aria-label="Закрыть уведомления"
            >
              ×
            </button>
          </div>
          <PushNotificationCenter />
        </div>
      ) : null}

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
