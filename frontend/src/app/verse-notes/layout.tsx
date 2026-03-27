import { playfairDisplay } from "@/styles/fonts"
import styles from "./verse-notes.module.scss"

export default function VerseNotesLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${playfairDisplay.variable} ${styles.shell}`}>{children}</div>
}
