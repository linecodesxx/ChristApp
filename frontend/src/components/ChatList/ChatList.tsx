import Image from "next/image"
import Link from "next/link"
import styles from "@/components/ChatList/ChatList.module.scss"

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
          <h2>Messages</h2>
          <button className={styles.newChatButton} onClick={onCreateChat} type="button">
            <Image src="/icon-newChat.svg" alt="New Chat" width={24} height={24} className={styles.newChatIcon} />
          </button>
        </div>
        <div className={styles.searchBar}>
          <Image src="/icon-search.svg" alt="Search" width={16} height={16} className={styles.searchIcon} />
          <input className={styles.searchInput} type="search" name="search" id="search" placeholder="Search" />
        </div>

        <ul className={styles.chatList}>
          {list.map((chat) => (
            <li key={chat.id} className={styles.chatItem}>
              {chat.href ? (
                <Link
                  href={chat.href}
                  className={styles.chatItemWrapper}
                  onClick={() => {
                    console.info("[ChatList] open room", { id: chat.id, title: chat.title })
                  }}
                >
                  <div className={styles.chatItemContent}>
                    <div className={styles.avatarInitials}>{chat.avatarInitials}</div>
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
                    <div className={styles.avatarInitials}>{chat.avatarInitials}</div>
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
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default ChatList
