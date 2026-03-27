"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import styles from "@/components/ChatList/ChatList.module.scss"
import { GLOBAL_ROOM_ID } from "@/lib/chatRooms"
import { getAvatarColor } from "@/lib/avatarColor"
import { getInitials } from "@/lib/utils"
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl"

export type ChatListItem = {
  id: string
  title: string
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
}

const ChatList = ({ items, onCreateChat, chatCandidates = [], onDeleteChat }: ChatListProps) => {
  const list: ChatListItem[] = items
  const [isUserPickerOpen, setIsUserPickerOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const swipeTouchRef = useRef<{ x: number; y: number; id: string } | null>(null)
  const chatRowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const normalizedSearch = searchValue.trim().toLowerCase()

  const filteredChatList = useMemo(() => {
    if (!normalizedSearch) {
      return list
    }
    return list.filter((chat) => {
      const title = chat.title.toLowerCase()
      const preview = (chat.preview ?? "").toLowerCase()
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

  const searchPlaceholder = "Найти по чату, имени или username"

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

  useEffect(() => {
    if (!swipeOpenId) {
      return
    }

    const onDocTouchStart = (event: TouchEvent) => {
      const el = chatRowRefs.current.get(swipeOpenId)
      const target = event.target as Node
      if (el && !el.contains(target)) {
        setSwipeOpenId(null)
      }
    }

    document.addEventListener("touchstart", onDocTouchStart, true)
    return () => document.removeEventListener("touchstart", onDocTouchStart, true)
  }, [swipeOpenId])

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
            aria-label="Выбор пользователя для нового чата"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.userPickerHeader}>
              <div>
                <h3 className={styles.userPickerTitle}>Новый чат</h3>
                <p className={styles.userPickerSubtitle}>Выберите пользователя, которому хотите написать</p>
              </div>
              <button
                type="button"
                className={styles.userPickerCloseButton}
                onClick={closeUserPicker}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            {renderSearchField("chat-user-picker-search", true)}

            <ul className={styles.userPickerList}>
              {filteredCandidates.map((candidate) => {
                const avatarColor = getAvatarColor(candidate.id)
                const pickerAvatarSrc = resolvePublicAvatarUrl(candidate.avatarUrl)

                return (
                  <li key={candidate.id} className={styles.userPickerListItem}>
                    <button
                      type="button"
                      className={styles.userPickerItem}
                      onClick={() => handleSelectCandidate(candidate.id)}
                    >
                      <span className={styles.userPickerAvatarWrap}>
                        {pickerAvatarSrc ? (
                          <Image
                            src={pickerAvatarSrc}
                            alt=""
                            width={40}
                            height={40}
                            className={styles.userPickerAvatarImg}
                            unoptimized
                          />
                        ) : (
                          <span className={styles.userPickerAvatar} style={{ backgroundColor: avatarColor }}>
                            {getInitials(candidate.username)}
                          </span>
                        )}
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
                        {candidate.hasDirectChat ? "Уже есть чат" : "Новый"}
                      </span>
                    </button>
                  </li>
                )
              })}

              {filteredCandidates.length === 0 && (
                <li className={styles.userPickerEmpty}>
                  {chatCandidates.length === 0 ? "Пока нет доступных пользователей" : "Никого не нашли по запросу"}
                </li>
              )}
            </ul>
          </section>
        </div>
      )}

      <div className={styles.chatListWrapper}>
        <div className={styles.header}>
          <h2>ChristApp</h2>
          <button
            className={styles.newChatButton}
            onClick={openUserPicker}
            type="button"
            aria-label="Создать новый чат"
            title="Новый чат"
          >
            <Image src="/icon-newChat.svg" alt="New Chat" width={24} height={24} className={styles.newChatIcon} />
          </button>
        </div>
        <div className={styles.searchBar}>{renderSearchField("chat-list-search")}</div>

        <ul className={styles.chatList}>
          {filteredChatList.length === 0 && normalizedSearch ? (
            <li className={styles.chatListNoResults}>Нет чатов по запросу</li>
          ) : null}

          {filteredChatList.map((chat) => (
            <li key={chat.id} className={styles.chatItem} data-menu-open={openMenuId === chat.id ? "" : undefined}>
              {(() => {
                const avatarColor = getAvatarColor(chat.id)
                const unreadCount = typeof chat.unread === "number" ? chat.unread : chat.unread ? 1 : 0
                const isCompactPreviewRow = chat.id !== GLOBAL_ROOM_ID
                const showMenu = Boolean(chat.deletable && onDeleteChat)
                const menuOpen = openMenuId === chat.id

                const mainInner = (
                  <>
                    <div className={styles.avatarWrapper} title={chat.isOnline ? "В сети" : undefined}>
                      {chat.avatarImage ? (
                        <Image
                          src={chat.avatarImage}
                          alt={chat.title}
                          width={40}
                          height={40}
                          unoptimized={chat.avatarImage.startsWith("http")}
                          className={
                            chat.avatarClass ? `${styles.avatarImage} ${chat.avatarClass}` : styles.avatarImage
                          }
                        />
                      ) : (
                        <div className={styles.avatarInitials} style={{ backgroundColor: avatarColor }}>
                          {chat.avatarInitials}
                        </div>
                      )}
                      {chat.isOnline ? <span className={styles.avatarOnlineDot} /> : null}
                    </div>
                    <div className={styles.chatInfo}>
                      <div className={styles.flex}>
                        <div className={styles.titleRow}>
                          <h3 className={styles.title}>{chat.title}</h3>
                        </div>
                        <span className={styles.chatTime}>{chat.timeLabel ?? ""}</span>
                      </div>

                      <div className={styles.flex}>
                        <p
                          className={
                            isCompactPreviewRow
                              ? `${styles.chatPreview} ${styles.chatPreviewDirect}`
                              : styles.chatPreview
                          }
                        >
                          {chat.preview ?? ""}
                        </p>
                        {unreadCount > 0 ? <span className={styles.unreadBadge}>{unreadCount}</span> : null}
                      </div>
                    </div>
                  </>
                )

                const swipeOpen = swipeOpenId === chat.id

                const linkOrStatic =
                  chat.href != null && chat.href !== "" ? (
                    <Link
                      href={chat.href}
                      className={styles.chatItemMainLink}
                      onClick={(event) => {
                        if (swipeOpen) {
                          event.preventDefault()
                          setSwipeOpenId(null)
                        }
                      }}
                    >
                      {mainInner}
                    </Link>
                  ) : (
                    <div className={styles.chatItemMainLink}>{mainInner}</div>
                  )

                return (
                  <div
                    className={styles.chatItemWrapper}
                    ref={(node) => {
                      if (node) {
                        chatRowRefs.current.set(chat.id, node)
                      } else {
                        chatRowRefs.current.delete(chat.id)
                      }
                    }}
                  >
                    <div className={styles.chatItemContent}>
                      <div className={styles.chatItemSwipeClip}>
                        <div
                          className={`${styles.chatItemSwipeTrack} ${swipeOpen ? styles.chatItemSwipeTrackOpen : ""}`}
                          onTouchStart={
                            showMenu
                              ? (e) => {
                                  swipeTouchRef.current = {
                                    x: e.touches[0].clientX,
                                    y: e.touches[0].clientY,
                                    id: chat.id,
                                  }
                                }
                              : undefined
                          }
                          onTouchEnd={
                            showMenu
                              ? (e) => {
                                  const start = swipeTouchRef.current
                                  swipeTouchRef.current = null
                                  if (!start || start.id !== chat.id) {
                                    return
                                  }
                                  const t = e.changedTouches[0]
                                  const dx = t.clientX - start.x
                                  const dy = t.clientY - start.y
                                  if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
                                    return
                                  }
                                  if (Math.abs(dx) <= Math.abs(dy)) {
                                    return
                                  }
                                  if (dx < -40) {
                                    setSwipeOpenId(chat.id)
                                    setOpenMenuId(null)
                                  } else if (dx > 36 && swipeOpenId === chat.id) {
                                    setSwipeOpenId(null)
                                  }
                                }
                              : undefined
                          }
                        >
                          {linkOrStatic}
                          {showMenu ? (
                            <div className={styles.chatItemMenuWrap} data-open={menuOpen ? "true" : undefined}>
                              <button
                                type="button"
                                ref={menuOpen ? menuTriggerRef : undefined}
                                className={styles.chatItemMenuButton}
                                aria-label="Действия с чатом"
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
                                      setSwipeOpenId(null)
                                      if (
                                        window.confirm("Удалить этот чат из списка? История у собеседника останется.")
                                      ) {
                                        onDeleteChat?.(chat.id)
                                      }
                                    }}
                                  >
                                    Удалить чат
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
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
