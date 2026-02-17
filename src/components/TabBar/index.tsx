import Link from "next/link";
import styles from "./TabBar.module.scss";

export default function TabBar() {
  return (
    <nav className={styles.nav}>
      <Link href="/bible">Библия</Link>
      <Link href="/chat">Чат</Link>
      <Link href="/login">Логин</Link>
    </nav>
  );
}