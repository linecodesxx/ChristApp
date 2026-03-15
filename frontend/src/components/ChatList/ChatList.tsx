"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import styles from "@/components/ChatList/ChatList.module.scss"
import { getInitials } from "@/lib/utils"

const AVATAR_COLORS = ["#8B9E7E", "#7EA18F", "#9A8BB5", "#7C97C4", "#B08A7E", "#7FA8A8", "#9B8F77", "#8C8FAE"]

function getAvatarColor(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index)
    hash |= 0
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export type ChatListItem = {
  id: string
  title: string
  preview?: string
  timeLabel?: string
  avatarInitials: string
  unread?: boolean | number
  href?: string
  isOnline?: boolean
}

export type ChatCreateCandidate = {
  id: string
  username: string
  email: string
  isOnline: boolean
  hasDirectChat: boolean
}

type ChatListProps = {
  items: ChatListItem[]
  onCreateChat?: (targetUserId: string) => void
  chatCandidates?: ChatCreateCandidate[]
}

const ChatList = ({ items, onCreateChat, chatCandidates = [] }: ChatListProps) => {
  const list: ChatListItem[] = items
  const [isUserPickerOpen, setIsUserPickerOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  const normalizedSearch = searchValue.trim().toLowerCase()

  const filteredCandidates = useMemo(() => {
    if (!normalizedSearch) {
      return chatCandidates
    }

    return chatCandidates.filter((candidate) => {
      const nameMatch = candidate.username.toLowerCase().includes(normalizedSearch)
      const emailMatch = candidate.email.toLowerCase().includes(normalizedSearch)
      return nameMatch || emailMatch
    })
  }, [chatCandidates, normalizedSearch])

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
              <button type="button" className={styles.userPickerCloseButton} onClick={closeUserPicker} aria-label="Закрыть">
                ✕
              </button>
            </div>

            <label className={styles.userPickerSearch}>
              <Image
                src="/icon-search.svg"
                alt="Search"
                width={16}
                height={16}
                className={styles.userPickerSearchIcon}
              />
              <input
                className={styles.userPickerSearchInput}
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Найти по username или email"
                autoFocus
              />
            </label>

            <ul className={styles.userPickerList}>
              {filteredCandidates.map((candidate) => {
                const avatarColor = getAvatarColor(candidate.id)

                return (
                  <li key={candidate.id} className={styles.userPickerListItem}>
                    <button type="button" className={styles.userPickerItem} onClick={() => handleSelectCandidate(candidate.id)}>
                      <span className={styles.userPickerAvatar} style={{ backgroundColor: avatarColor }}>
                        {getInitials(candidate.username)}
                      </span>

                      <span className={styles.userPickerInfo}>
                        <span className={styles.userPickerNameRow}>
                          <span className={styles.userPickerName}>{candidate.username}</span>
                          {candidate.isOnline ? <span className={styles.userPickerOnline}>онлайн</span> : null}
                        </span>
                        <span className={styles.userPickerEmail}>{candidate.email}</span>
                      </span>

                      <span
                        className={
                          candidate.hasDirectChat ? styles.userPickerBadgeExisting : styles.userPickerBadgeNew
                        }
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
        <div className={styles.searchBar}>
          <Image src="/icon-search.svg" alt="Search" width={16} height={16} className={styles.searchIcon} />
          <input className={styles.searchInput} type="search" name="search" id="search" placeholder="Search" />
        </div>

        <ul className={styles.chatList}>
          {/* <span className={styles.pinnedLabel}>
            <Image src="/icon-pinned.svg" alt="Pinned" width={12} height={12} />
            Pinned
          </span> */}

          {list.map((chat) => (
            <li key={chat.id} className={styles.chatItem}>
              {(() => {
                const avatarColor = getAvatarColor(chat.id)
                const unreadCount = typeof chat.unread === "number" ? chat.unread : chat.unread ? 1 : 0

                const content = (
                  <div className={styles.chatItemContent}>
                    <div className={styles.avatarWrapper}>
                      <div className={styles.avatarInitials} style={{ backgroundColor: avatarColor }}>
                        {chat.avatarInitials}
                      </div>
                      {chat.isOnline ? <span className={styles.avatarOnlineDot} /> : null}
                    </div>
                    <div className={styles.chatInfo}>
                      <div className={styles.flex}>
                        <div className={styles.titleRow}>
                          <h3 className={styles.title}>{chat.title}</h3>
                          {chat.isOnline ? <span className={styles.onlineLabel}>онлайн</span> : null}
                        </div>
                        <span className={styles.chatTime}>{chat.timeLabel ?? ""}</span>
                      </div>

                      <div className={styles.flex}>
                        <p className={styles.chatPreview}>{chat.preview ?? ""}</p>
                        {unreadCount > 0 ? <span className={styles.unreadBadge}>{unreadCount}</span> : null}
                      </div>
                    </div>
                  </div>
                )

                if (chat.href) {
                  return (
                    <Link href={chat.href} className={styles.chatItemWrapper}>
                      {content}
                    </Link>
                  )
                }

                return <div className={styles.chatItemWrapper}>{content}</div>
              })()}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default ChatList
