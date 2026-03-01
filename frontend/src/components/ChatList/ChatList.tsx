import Image from "next/image"
import Link from "next/link"
import styles from "@/components/ChatList/ChatList.module.scss"

const AVATAR_COLORS = [
  "#8B9E7E",
  "#7EA18F",
  "#9A8BB5",
  "#7C97C4",
  "#B08A7E",
  "#7FA8A8",
  "#9B8F77",
  "#8C8FAE",
]

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
}

type ChatListProps = {
  items: ChatListItem[]
  onCreateChat?: () => void
}

const ChatList = ({ items, onCreateChat }: ChatListProps) => {
  const list: ChatListItem[] = items

  return (
    <section className={styles.chatListSection}>
      <div className={styles.chatListWrapper}>
        <div className={styles.header}>
          <h2>ChristApp</h2>
          <button className={styles.newChatButton} onClick={onCreateChat} type="button">
            <Image src="/icon-newChat.svg" alt="New Chat" width={24} height={24} className={styles.newChatIcon} />
          </button>
        </div>
        <div className={styles.searchBar}>
          <Image src="/icon-search.svg" alt="Search" width={16} height={16} className={styles.searchIcon} />
          <input className={styles.searchInput} type="search" name="search" id="search" placeholder="Search" />
        </div>

        <ul className={styles.chatList}>
          <span className={styles.pinnedLabel}>
            <Image src="/icon-pinned.svg" alt="Pinned" width={12} height={12} />
            Pinned
          </span>

          {list.map((chat) => (
            <li key={chat.id} className={styles.chatItem}>
              {(() => {
                const avatarColor = getAvatarColor(chat.id)

                return chat.href ? (
                  <Link
                    href={chat.href}
                    className={styles.chatItemWrapper}
                    onClick={() => {
                      console.info("[ChatList] open room", { id: chat.id, title: chat.title })
                    }}
                  >
                    <div className={styles.chatItemContent}>
                      <div className={styles.avatarInitials} style={{ backgroundColor: avatarColor }}>
                        {chat.avatarInitials}
                      </div>
                      <div className={styles.chatInfo}>
                        <div className={styles.flex}>
                          <h3 className={styles.title}>{chat.title}</h3>
                          <span className={styles.chatTime}>{chat.timeLabel ?? ""}</span>
                        </div>

                        <div className={styles.flex}>
                          <p className={styles.chatPreview}>{chat.preview ?? ""}</p>
                          {(() => {
                            const unreadCount = typeof chat.unread === "number" ? chat.unread : chat.unread ? 1 : 0

                            return unreadCount > 0 ? <span className={styles.unreadBadge}>{unreadCount}</span> : null
                          })()}
                        </div>
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div className={styles.chatItemWrapper}>
                    <div className={styles.chatItemContent}>
                      <div className={styles.avatarInitials} style={{ backgroundColor: avatarColor }}>
                        {chat.avatarInitials}
                      </div>
                      <div className={styles.chatInfo}>
                        <div className={styles.flex}>
                          <h3 className={styles.title}>{chat.title}</h3>
                          <span className={styles.chatTime}>{chat.timeLabel ?? ""}</span>
                        </div>

                        <div className={styles.flex}>
                          <p className={styles.chatPreview}>{chat.preview ?? ""}</p>
                          {(() => {
                            const unreadCount = typeof chat.unread === "number" ? chat.unread : chat.unread ? 1 : 0

                            return unreadCount > 0 ? <span className={styles.unreadBadge}>{unreadCount}</span> : null
                          })()}
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
