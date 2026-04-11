import styles from "./verse-notes.module.scss"

export default function VerseNotesLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.shell}>{children}</div>
}
