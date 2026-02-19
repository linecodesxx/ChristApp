import Link from "next/link"
import styles from "./TabBar.module.scss"
import Image from "next/image"

export default function TabBar() {
  return (
    <nav className={styles.nav}>
      <Link className={styles.iconBible} href="/bible">
        <Image src="/icon-bible.svg" alt="Библия" width={24} height={24} />
        Bible
      </Link>
      <Link className={styles.iconChat} href="/chat">
        <Image src="/icon-chat.svg" alt="Чат" width={24} height={24} />
      </Link>
      <Link className={styles.iconProfile} href="/auth/login">
        <Image src="/icon-profile.svg" alt="Логин" width={24} height={24} />
        Profile
      </Link>
    </nav>
  )
}


