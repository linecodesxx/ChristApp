import Image from "next/image"
import styles from "@/components/ChatList/ChatList.module.scss"
import chats from "@app/chatlist/chats.json"

const ChatList = () => {
  return (
    <section className={styles.chatList}>
      <div className={styles.chatListWrapper}>
        <div className={styles.header}>
          <h2>Messages</h2>
          <button className={styles.newChatButton}>
            <Image src="/icon-newChat.svg" alt="New Chat" width={24} height={24} className={styles.newChatIcon} />
          </button>
        </div>
        <div className={styles.searchBar}>
          <Image src="/icon-search.svg" alt="Search" width={16} height={16} className={styles.searchIcon} />
          <input className={styles.searchInput} type="search" name="search" id="search" placeholder="Search" />
        </div>

        <ul className={styles.chatList}>
          {chats.map((chat) => (
            <li key={chat.id} className={styles.chatItem}>
              <a href={`/chat/${chat.id}`} className={styles.chatItemWrapper}>
                <div className={styles.chatItemContent}>
                  <div className={styles.avatarInitials}>{chat.avatarInitials}</div>
                  <div className={styles.chatInfo}>
                    <div className={styles.flex}>
                      <h3 className={styles.title}>{chat.title}</h3>
                      <span className={styles.chatTime}>{chat.timeLabel}</span>
                    </div>

                    <div className={styles.flex}>
                      <p className={styles.chatPreview}>{chat.preview}</p>
                      {chat.unread && <span className={styles.unreadBadge}>{chat.unread}</span>}
                    </div>
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default ChatList
