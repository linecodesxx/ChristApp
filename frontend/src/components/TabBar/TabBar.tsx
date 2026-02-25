"use client"

import Link from "next/link"
import styles from "@/components/TabBar/TabBar.module.scss"
import Image from "next/image"
import { usePathname } from "next/navigation"

export default function TabBar() {
  const pathname = usePathname()

  const isRouteActive = (route: string) => pathname === route || pathname.startsWith(`${route}/`)

  return (
    <nav className={styles.nav}>
      <Link className={styles.tabLink} href="/bible">
        <span className={`${styles.iconWrap} ${isRouteActive("/bible") ? styles.activeIcon : ""}`}>
          <Image src="/icon-bible.svg" alt="Библия" width={24} height={24} />
        </span>
      </Link>
      <Link className={styles.tabLink} href="/chat">
        <span className={`${styles.iconWrap} ${isRouteActive("/chat") ? styles.activeIcon : ""}`}>
          <Image src="/icon-chat.svg" alt="Чат" width={24} height={24} />
        </span>
      </Link>
      <Link className={styles.tabLink} href="/profile">
        <span className={`${styles.iconWrap} ${isRouteActive("/profile") ? styles.activeIcon : ""}`}>
          <Image src="/icon-profile.svg" alt="Профиль" width={24} height={24} />
        </span>
      </Link>
    </nav>
  )
}
