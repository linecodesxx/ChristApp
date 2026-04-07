"use client"

import styles from "@/app/profile/profile.module.scss"
import { useAuth, type AuthUser } from "@/hooks/useAuth"
import { formatMemberSince, getInitials } from "@/lib/utils"
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback"
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl"
import { getAppStreak } from "@/lib/appStreak"
import PersistenceAchievements from "@/components/PersistenceAchievements/PersistenceAchievements"
import { deleteSavedVerse } from "@/lib/versesApi"
import { getApiErrorMessage } from "@/lib/apiError"
import { USERNAME_REGEX } from "@/lib/formValidation"
import PushNotificationCenter from "@/components/PushNotificationCenter/PushNotificationCenter"
import { getAuthToken } from "@/lib/auth"
import { apiFetch } from "@/lib/apiFetch"
import {
  SUGGESTED_THEME_BACKGROUND,
  SUGGESTED_THEME_FOREGROUND,
  normalizeThemeFontKey,
  type ThemeFontKey,
} from "@/lib/userAppearance"
import { isPushSupportedInBrowser } from "@/lib/push"
import { fetchPushStatusForQuery, pushStatusQueryKey } from "@/lib/queries/pushQueries"
import { getHttpApiBase } from "@/lib/apiBase"
import { currentUserQueryKey } from "@/lib/queries/authQueries"
import { fetchSavedVersesForQuery, savedVersesQueryKey } from "@/lib/queries/versesQueries"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { useHydrated } from "@/hooks/useHydrated"
import Link from "next/link"
import Image from "next/image"
import ProfileChaptersCard from "@/components/ProfileChaptersCard/ProfileChaptersCard"

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

function effectiveThemeForegroundHex(user: { themeForegroundHex?: string | null } | null): string {
  const raw = user?.themeForegroundHex?.trim() ?? ""
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : SUGGESTED_THEME_FOREGROUND.toLowerCase()
}

export default function ProfilePage() {
  const hydrated = useHydrated()
  const queryClient = useQueryClient()
  const { user, logout, refreshSession, patchUser, replaceUser } = useAuth({
    redirectIfUnauthenticated: "/",
  })
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [pushPermission, setPushPermission] = useState<PushPermissionState>("unsupported")
  const [pushSyncErrorMessage, setPushSyncErrorMessage] = useState<string | null>(null)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const avatarFileRef = useRef<HTMLInputElement | null>(null)
  const [isAvatarUploading, setIsAvatarUploading] = useState(false)
  const [nickEdit, setNickEdit] = useState("")
  const [handleEdit, setHandleEdit] = useState("")
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
  const [avatarCacheBust, setAvatarCacheBust] = useState(0)
  const [dayStreak, setDayStreak] = useState(0)
  const [themeBgInput, setThemeBgInput] = useState(SUGGESTED_THEME_BACKGROUND)
  const [themeFontInput, setThemeFontInput] = useState<ThemeFontKey>("inter")
  /** Блок «Постоянство / стрики» по умолчанию скрыт; открывается только по кнопке «Серия дней». */
  const [isPersistenceOpen, setIsPersistenceOpen] = useState(false)

  useEffect(() => {
    setIsPersistenceOpen(false)
  }, [user?.id])

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
    const sync = () => setDayStreak(getAppStreak())
    const onVis = () => {
      if (document.visibilityState === "visible") {
        sync()
      }
    }
    window.addEventListener("focus", sync)
    document.addEventListener("visibilitychange", onVis)
    return () => {
      window.removeEventListener("focus", sync)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [user])

  const versesQuery = useQuery({
    queryKey: savedVersesQueryKey(),
    queryFn: fetchSavedVersesForQuery,
    enabled: Boolean(user),
    staleTime: 60_000,
  })

  const savedVerses = versesQuery.data ?? []

  const isVerseKeeperUnlocked = savedVerses.length >= 5
  const verseKeeperProgress = `${Math.min(savedVerses.length, 5)} из 5`
  const verseKeeperUnlockedUI = hydrated && isVerseKeeperUnlocked
  const verseKeeperProgressUI = hydrated ? verseKeeperProgress : "0 из 5"

  const pushStatusQuery = useQuery({
    queryKey: pushStatusQueryKey(user?.id),
    queryFn: fetchPushStatusForQuery,
    enabled: Boolean(user?.id),
    staleTime: 45_000,
  })

  const isPushConfigured = Boolean(pushStatusQuery.data?.enabled)
  const hasPushSubscription = Boolean(pushStatusQuery.data?.hasSubscription)

  useEffect(() => {
    if (!user) {
      return
    }
    setNickEdit(user.nickname ?? user.username)
    setHandleEdit(user.username)
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

    if (!user?.id || !isPushSupportedInBrowser()) {
      setPushSyncErrorMessage(null)
      return
    }

    const pushStatus = await queryClient.fetchQuery({
      queryKey: pushStatusQueryKey(user.id),
      queryFn: fetchPushStatusForQuery,
      staleTime: 45_000,
    })
    if (pushStatus?.hasSubscription || !pushStatus?.enabled || permission !== "granted") {
      setPushSyncErrorMessage(null)
    }
  }, [queryClient, user?.id])

  useEffect(() => {
    if (!isSettingsOpen) {
      return
    }

    void refreshPushState()
  }, [isSettingsOpen, refreshPushState])

  const deleteVerseMutation = useMutation({
    mutationFn: (verseId: string) => deleteSavedVerse(verseId),
    onMutate: async (verseId) => {
      await queryClient.cancelQueries({ queryKey: savedVersesQueryKey() })
      const previous = queryClient.getQueryData<SavedVerse[]>(savedVersesQueryKey())
      queryClient.setQueryData<SavedVerse[]>(savedVersesQueryKey(), (old) =>
        (old ?? []).filter((v) => v.id !== verseId),
      )
      return { previous }
    },
    onError: (_err, _verseId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(savedVersesQueryKey(), context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: savedVersesQueryKey() })
    },
  })

  const handleDeleteVerse = (verseId: string) => {
    deleteVerseMutation.mutate(verseId)
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

  const API_URL = getHttpApiBase()

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

      const response = await apiFetch(`${API_URL}/users/me/avatar`, {
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

  type SaveProfileVars = {
    body: Record<string, string>
    optimisticPatch: Partial<AuthUser>
  }

  const saveProfileMutation = useMutation({
    mutationFn: async ({ body }: SaveProfileVars) => {
      const token = getAuthToken()
      if (!token || !API_URL) {
        throw new Error("Нет авторизации")
      }
      const res = await apiFetch(`${API_URL}/users/me`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(getApiErrorMessage(errData, "Не удалось сохранить"))
      }
      return (await res.json()) as AuthUser
    },
    onMutate: async (variables: SaveProfileVars) => {
      if (!user) {
        return { previousUser: null as AuthUser | null }
      }
      await queryClient.cancelQueries({ queryKey: currentUserQueryKey(user.id) })
      const previousUser = { ...user }
      patchUser(variables.optimisticPatch)
      return { previousUser }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previousUser) {
        replaceUser(ctx.previousUser)
      }
      window.alert(err instanceof Error ? err.message : "Не удалось сохранить")
    },
    onSuccess: (serverUser) => {
      replaceUser(serverUser)
      closeProfileEdit()
    },
  })

  const resetAppearanceMutation = useMutation({
    mutationFn: async () => {
      const token = getAuthToken()
      if (!token || !API_URL) {
        throw new Error("Нет авторизации")
      }
      const res = await apiFetch(`${API_URL}/users/me`, {
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
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(getApiErrorMessage(errData, "Не удалось сбросить оформление"))
      }
      return (await res.json()) as AuthUser
    },
    onMutate: async () => {
      if (!user) {
        return { previousUser: null as AuthUser | null }
      }
      await queryClient.cancelQueries({ queryKey: currentUserQueryKey(user.id) })
      const previousUser = { ...user }
      patchUser({
        themeForegroundHex: null,
        themeBackgroundHex: null,
        themeFontKey: null,
      })
      setThemeBgInput(SUGGESTED_THEME_BACKGROUND)
      setThemeFontInput("inter")
      return { previousUser }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previousUser) {
        replaceUser(ctx.previousUser)
        setThemeBgInput(ctx.previousUser.themeBackgroundHex || SUGGESTED_THEME_BACKGROUND)
        setThemeFontInput(normalizeThemeFontKey(ctx.previousUser.themeFontKey))
      }
      window.alert(err instanceof Error ? err.message : "Не удалось сбросить оформление")
    },
    onSuccess: (serverUser) => {
      replaceUser(serverUser)
      setThemeBgInput(SUGGESTED_THEME_BACKGROUND)
      setThemeFontInput("inter")
    },
  })

  const profileSaving = saveProfileMutation.isPending
  const appearanceSaving = resetAppearanceMutation.isPending

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

  const handleSaveProfile = () => {
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

    const hexFg = effectiveThemeForegroundHex(user)
    const hexBg = themeBgInput.trim().toLowerCase()
    if (!/^#[0-9a-f]{6}$/.test(hexBg)) {
      window.alert("Цвет фона: выберите оттенок в палитре (формат #RRGGBB).")
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

    const userBg = (user.themeBackgroundHex ?? "").toLowerCase()
    const effBg = userBg || SUGGESTED_THEME_BACKGROUND.toLowerCase()
    const sameTheme = hexBg === effBg && themeFontInput === normalizeThemeFontKey(user.themeFontKey)
    const sameNick = nextNick === (user.nickname ?? user.username)
    const sameHandle = nextHandle === user.username
    if (sameNick && sameHandle && sameTheme) {
      return
    }

    const optimisticPatch: Partial<AuthUser> = {
      themeForegroundHex: hexFg,
      themeBackgroundHex: hexBg,
      themeFontKey: themeFontInput,
    }
    if (!sameNick) {
      optimisticPatch.nickname = nextNick
    }
    if (!sameHandle) {
      optimisticPatch.username = nextHandle
    }

    saveProfileMutation.mutate({
      body: body as Record<string, string>,
      optimisticPatch,
    })
  }

  const handleResetAppearance = () => {
    if (!API_URL || !user) {
      return
    }
    if (!getAuthToken()) {
      return
    }
    resetAppearanceMutation.mutate()
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

            <button type="button" className={styles.menuItem} role="menuitem" onClick={openProfileEditFromSettings}>
              <span>Редактировать профиль</span>
              <span className={styles.menuHint}>Ник и @username</span>
            </button>

            <button type="button" className={styles.menuItem} role="menuitem" onClick={openNotificationsFromMenu}>
              <span>Уведомления</span>
              <span className={styles.menuHint}>{pushHint}</span>
            </button>

            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              role="menuitem"
              onClick={handleLogoutFromMenu}
            >
              <span>Выйти из аккаунта</span>
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

          <label className={styles.profileLabel}>
            Цвет фона
            <span className={styles.colorRow}>
              <input
                className={styles.colorInput}
                type="color"
                value={
                  themeBgInput.startsWith("#") && themeBgInput.length === 7 ? themeBgInput : SUGGESTED_THEME_BACKGROUND
                }
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
              <option value="bodoni-moda">Bodoni Moda</option>
              <option value="plus-jakarta-sans">Plus Jakarta Sans</option>
              <option value="cinzel">Cinzel</option>
            </select>
          </label>

          <div className={styles.profileEditActions}>
            <button type="button" className={styles.profileCancel} onClick={closeProfileEdit} disabled={profileSaving}>
              Отмена
            </button>
            <button
              type="button"
              className={styles.profileSave}
              onClick={handleSaveProfile}
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
        <li className={`${styles.item} ${styles.itemInteractive}`}>
          <Link
            href="#persistence-section"
            scroll={false}
            className={styles.itemLink}
            onClick={(event) => {
              event.preventDefault()
              setIsPersistenceOpen((open) => !open)
            }}
            aria-expanded={isPersistenceOpen}
            aria-controls="persistence-section"
          >
            <Image className={styles.imgIcon} src={"/icon-fire.svg"} alt="Серия дней" width={16} height={16} />
            <span>{dayStreak}</span>
            <span className={styles.rewardStatePlaceholder} aria-hidden />
            <p className={styles.statCardLabel}>Серия дней</p>
          </Link>
        </li>
        <ProfileChaptersCard />
        <li
          className={[styles.item, styles.rewardItem, verseKeeperUnlockedUI ? styles.rewardItemUnlocked : ""]
            .filter(Boolean)
            .join(" ")}
        >
          <Image
            className={[styles.imgIcon, verseKeeperUnlockedUI ? styles.rewardIconUnlocked : ""]
              .filter(Boolean)
              .join(" ")}
            src={"/icon-badge.svg"}
            alt="Награды"
            width={16}
            height={16}
          />
          <span className={styles.rewardValue}>{verseKeeperProgressUI}</span>
          {verseKeeperUnlockedUI ? <span className={styles.rewardState}>Получено</span> : null}
          <p className={styles.statCardLabel}>Хранитель стихов</p>
        </li>
      </ul>

      {isPersistenceOpen ? (
        <div id="persistence-section">
          <PersistenceAchievements
            dayStreak={dayStreak}
            savedVersesCount={hydrated ? savedVerses.length : 0}
          />
        </div>
      ) : null}

      {/* СЕКЦИЯ СОХРАНЁННЫХ СТИХОВ — до hydrated не опираемся на persist-кэш RQ (иначе mismatch SSR/клиент). */}
      <div className={styles.savedVersesSection}>
        <div className={styles.sectionHeader}>
          <span>Сохранённые стихи ({hydrated ? savedVerses.length : 0})</span>
        </div>

        {!hydrated || (versesQuery.isPending && savedVerses.length === 0) ? (
          <div className={styles.versesLoadingWrap}>Loading...</div>
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
                    {hydrated ? new Date(verse.savedAt).toLocaleDateString("ru-RU") : "\u2014"}
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
    </section>
  )
}
