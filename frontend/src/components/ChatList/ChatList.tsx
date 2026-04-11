"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import styles from "@/components/ChatList/ChatList.module.scss"
import AvatarWithFallback from "@/components/AvatarWithFallback/AvatarWithFallback"
import { GLOBAL_ROOM_ID } from "@/lib/chatRooms"
import { getInitials } from "@/lib/utils"
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl"

export type ChatListItem = {
  id: string
  title: string
  titleLoading?: boolean
  preview?: string
  timeLabel?: string
  /** ISO-время последней активности — для сортировки личных чатов (новые сверху под общим чатом). */
  lastActivityAt?: string
  avatarInitials?: string
  avatarImage?: string
  avatarClass?: string
  unread?: boolean | number
  href?: string
  isOnline?: boolean
  /** Показать меню «⋯» с удалением (общий чат и служебные строки — без меню). */
  deletable?: boolean
}

export type ChatCreateCandidate = {
  id: string
  /** Отображаемое имя (ник). */
  username: string
  /** @username для поиска. */
  handle: string
  email: string
  isOnline: boolean
  hasDirectChat: boolean
  avatarUrl?: string | null
}

type ChatListProps = {
  items: ChatListItem[]
  onCreateChat?: (targetUserId: string) => void
  chatCandidates?: ChatCreateCandidate[]
  onDeleteChat?: (listItemId: string) => void
  onPrefetchChat?: (listItemId: string) => void
  verseNotesVisible?: boolean
  isLoading?: boolean
}

function toRenderText(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number") {
    return String(value)
  }
  return fallback
}

const ChatList = ({
  items,
  onCreateChat,
  chatCandidates = [],
  onDeleteChat,
  onPrefetchChat,
  verseNotesVisible = false,
  isLoading = false,
}: ChatListProps) => {
  const t = useTranslations("chat")
  const list: ChatListItem[] = items
  const [isUserPickerOpen, setIsUserPickerOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)

  const normalizedSearch = searchValue.trim().toLowerCase()

  const filteredChatList = useMemo(() => {
    if (!normalizedSearch) {
      return list
    }
    return list.filter((chat) => {
      const title = toRenderText(chat.title).toLowerCase()
      const preview = toRenderText(chat.preview).toLowerCase()
      return title.includes(normalizedSearch) || preview.includes(normalizedSearch)
    })
  }, [list, normalizedSearch])

  const filteredCandidates = useMemo(() => {
    if (!normalizedSearch) {
      return chatCandidates
    }

    return chatCandidates.filter((candidate) => {
      const q = normalizedSearch.replace(/^@/, "")
      const nameMatch = candidate.username.toLowerCase().includes(normalizedSearch)
      const handleMatch = candidate.handle.toLowerCase().includes(q)
      const emailMatch = candidate.email.toLowerCase().includes(normalizedSearch)
      return nameMatch || handleMatch || emailMatch
    })
  }, [chatCandidates, normalizedSearch])

  const searchPlaceholder = t("listSearchPlaceholder")

  const renderSearchField = (id: string, autoFocus?: boolean) => (
    <label className={styles.userPickerSearch} htmlFor={id}>
      <Image src="/icon-search.svg" alt="" width={16} height={16} className={styles.userPickerSearchIcon} aria-hidden />
      <input
        id={id}
        className={styles.userPickerSearchInput}
        type="search"
        value={searchValue}
        onChange={(event) => setSearchValue(event.target.value)}
        placeholder={searchPlaceholder}
        autoFocus={Boolean(autoFocus)}
        autoComplete="off"
        enterKeyHint="search"
      />
    </label>
  )

  useEffect(() => {
    if (!isUserPickerOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsUserPickerOpen(false)
        setSearchValue("")
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isUserPickerOpen])

  useEffect(() => {
    if (!openMenuId) {
      return
    }

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || menuTriggerRef.current?.contains(target)) {
        return
      }
      setOpenMenuId(null)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenuId(null)
      }
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("touchstart", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("touchstart", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [openMenuId])

  const closeUserPicker = () => {
    setIsUserPickerOpen(false)
    setSearchValue("")
  }

  const openUserPicker = () => {
    if (!onCreateChat) return
    setIsUserPickerOpen(true)
  }

  const handleSelectCandidate = (targetUserId: string) => {
    onCreateChat?.(targetUserId)
    closeUserPicker()
  }

  return (
    <section className={styles.chatListSection}>
      {isUserPickerOpen && (
        <div className={styles.userPickerOverlay} onClick={closeUserPicker}>
          <section
            className={styles.userPicker}
            role="dialog"
            aria-modal="true"
            aria-label={t("userPickerAria")}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.userPickerHeader}>
              <div>
                <h3 className={styles.userPickerTitle}>{t("userPickerTitle")}</h3>
                <p className={styles.userPickerSubtitle}>{t("userPickerSubtitle")}</p>
              </div>
              <button
                type="button"
                className={styles.userPickerCloseButton}
                onClick={closeUserPicker}
                aria-label={t("close")}
              >
                ✕
              </button>
            </div>

            {renderSearchField("chat-user-picker-search", true)}

            <ul className={styles.userPickerList}>
              {filteredCandidates.map((candidate) => {
                const pickerAvatarSrc = resolvePublicAvatarUrl(candidate.avatarUrl)

                return (
                  <li key={candidate.id} className={styles.userPickerListItem}>
                    <button
                      type="button"
                      className={styles.userPickerItem}
                      onClick={() => handleSelectCandidate(candidate.id)}
                    >
                      <span
                        className={
                          candidate.isOnline
                            ? `${styles.userPickerAvatarWrap} ${styles.userPickerAvatarWrapOnline}`
                            : styles.userPickerAvatarWrap
                        }
                      >
                        <AvatarWithFallback
                          src={pickerAvatarSrc}
                          initials={getInitials(candidate.username)}
                          colorSeed={candidate.id}
                          width={40}
                          height={40}
                          imageClassName={styles.userPickerAvatarImg}
                          fallbackClassName={styles.userPickerAvatar}
                          fallbackTag="span"
                        />
                        {candidate.isOnline ? <span className={styles.userPickerOnlineDot} aria-hidden /> : null}
                      </span>

                      <span className={styles.userPickerInfo}>
                        <span className={styles.userPickerNameRow}>
                          <span className={styles.userPickerName}>{candidate.username}</span>
                        </span>
                        <span className={styles.userPickerHandle}>@{candidate.handle}</span>
                        <span className={styles.userPickerEmail}>{candidate.email}</span>
                      </span>

                      <span
                        className={candidate.hasDirectChat ? styles.userPickerBadgeExisting : styles.userPickerBadgeNew}
                      >
                        {candidate.hasDirectChat ? t("badgeExistingChat") : t("badgeNew")}
                      </span>
                    </button>
                  </li>
                )
              })}

              {filteredCandidates.length === 0 && (
                <li className={styles.userPickerEmpty}>
                  {chatCandidates.length === 0 ? t("userPickerNoUsers") : t("userPickerNoMatch")}
                </li>
              )}
            </ul>
          </section>
        </div>
      )}

      <div className={styles.chatListWrapper}>
        <div className={styles.header}>
          <h2>ChristApp</h2>
          <div className={styles.headerActions}>
            <Link
              href="/verse-notes"
              className={`${styles.verseNotesButton} ${!verseNotesVisible ? styles.headerActionHidden : ""}`}
              aria-label={t("verseNotesAria")}
              title={t("verseNotesTitle")}
              aria-hidden={!verseNotesVisible}
              tabIndex={verseNotesVisible ? 0 : -1}
            >
              <Image src="/icon-verse-notes.svg" alt="" width={22} height={22} className={styles.newChatIcon} />
            </Link>
            <button
              className={styles.newChatButton}
              onClick={openUserPicker}
              type="button"
              aria-label={t("newChatAria")}
              title={t("newChatTitle")}
            >
              <Image src="/icon-newChat.svg" alt={t("newChatImageAlt")} width={24} height={24} className={styles.newChatIcon} />
            </button>
          </div>
        </div>
        <div className={styles.searchBar}>{renderSearchField("chat-list-search")}</div>

        <ul className={styles.chatList}>
          {isLoading
            ? Array.from({ length: 6 }, (_, index) => (
                <li key={`chat-skeleton-${index}`} className={styles.chatItemSkeleton} aria-hidden>
                  <span className={styles.chatItemSkeletonAvatar} />
                  <div className={styles.chatItemSkeletonBody}>
                    <span className={styles.chatItemSkeletonTitle} />
                    <span className={styles.chatItemSkeletonPreview} />
                  </div>
                </li>
              ))
            : null}

          {!isLoading && filteredChatList.length === 0 && normalizedSearch ? (
            <li className={styles.chatListNoResults}>{t("listNoResults")}</li>
          ) : null}

          {!isLoading &&
            filteredChatList.map((chat) => (
            <li key={chat.id} className={styles.chatItem} data-menu-open={openMenuId === chat.id ? "" : undefined}>
              {(() => {
                const unreadCount = typeof chat.unread === "number" ? chat.unread : chat.unread ? 1 : 0
                const isCompactPreviewRow = chat.id !== GLOBAL_ROOM_ID
                const showMenu = Boolean(chat.deletable && onDeleteChat)
                const menuOpen = openMenuId === chat.id
                const safeTitle = toRenderText(chat.title)
                const safeTimeLabel = toRenderText(chat.timeLabel)
                const safePreview = toRenderText(chat.preview)

                const mainInner = (
                  <>
                    <div
                      className={
                        chat.isOnline
                          ? `${styles.avatarWrapper} ${styles.avatarWrapperOnline}`
                          : styles.avatarWrapper
                      }
                      title={chat.isOnline ? t("onlineTitle") : undefined}
                    >
                      <span className={styles.avatarCircle}>
                        <AvatarWithFallback
                          src={chat.avatarImage}
                          initials={chat.avatarInitials ?? "?"}
                          colorSeed={chat.id}
                          width={40}
                          height={40}
                          imageClassName={
                            chat.avatarClass ? `${styles.avatarImage} ${chat.avatarClass}` : styles.avatarImage
                          }
                          fallbackClassName={styles.avatarInitials}
                        />
                      </span>
                      {chat.isOnline ? <span className={styles.avatarOnlineDot} aria-hidden /> : null}
                    </div>
                    <div className={styles.chatInfo}>
                      <div className={styles.flex}>
                        <div className={styles.titleRow}>
                          {chat.titleLoading ? <span className={styles.chatInlineSkeletonTitle} aria-hidden /> : <h3 className={styles.title}>{safeTitle}</h3>}
                        </div>
                        <span className={styles.chatTime}>{safeTimeLabel}</span>
                      </div>

                      <div className={styles.flex}>
                        {chat.titleLoading ? (
                          <span className={styles.chatInlineSkeletonPreview} aria-hidden />
                        ) : (
                          <p
                            className={
                              isCompactPreviewRow
                                ? `${styles.chatPreview} ${styles.chatPreviewDirect}`
                                : styles.chatPreview
                            }
                          >
                            {safePreview}
                          </p>
                        )}
                        {unreadCount > 0 ? <span className={styles.unreadBadge}>{unreadCount}</span> : null}
                      </div>
                    </div>
                  </>
                )

                const linkOrStatic =
                  chat.href != null && chat.href !== "" ? (
                    <Link
                      href={chat.href}
                      className={styles.chatItemMainLink}
                      onMouseEnter={() => onPrefetchChat?.(chat.id)}
                      onFocus={() => onPrefetchChat?.(chat.id)}
                      onTouchStart={() => onPrefetchChat?.(chat.id)}
                    >
                      {mainInner}
                    </Link>
                  ) : (
                    <div className={styles.chatItemMainLink}>{mainInner}</div>
                  )

                return (
                  <div className={styles.chatItemWrapper}>
                    <div className={styles.chatItemContent}>
                      <div className={styles.chatItemSwipeClip}>
                        <div className={styles.chatItemSwipeTrack}>{linkOrStatic}</div>
                      </div>
                      {showMenu ? (
                        <div className={styles.chatItemMenuWrap} data-open={menuOpen ? "true" : undefined}>
                          <button
                            type="button"
                            ref={menuOpen ? menuTriggerRef : undefined}
                            className={styles.chatItemMenuButton}
                            aria-label={t("chatMenuAria")}
                            aria-haspopup="menu"
                            aria-expanded={menuOpen}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              setOpenMenuId((current) => (current === chat.id ? null : chat.id))
                            }}
                          >
                            ⋯
                          </button>
                          {menuOpen ? (
                            <div ref={menuRef} className={styles.chatItemMenu} role="menu">
                              <button
                                type="button"
                                role="menuitem"
                                className={styles.chatItemMenuItem}
                                onClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  setOpenMenuId(null)
                                  if (window.confirm(t("deleteChatConfirm"))) {
                                    onDeleteChat?.(chat.id)
                                  }
                                }}
                              >
                                {t("deleteChat")}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })()}
            </li>
            ))}
        </ul>
      </div>
    </section>
  )
}

export default ChatList
