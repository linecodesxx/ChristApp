import FeatherDivider from "./FeatherDivider"
import styles from "./PremiumNote.module.scss"

export type PremiumNoteProps = {
  sourceText: string
  responseText: string
  createdAt?: string
}

function formatNoteDate(iso: string | undefined): string {
  if (!iso) {
    return ""
  }
  try {
    const d = new Date(iso)
    return d.toLocaleString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

export default function PremiumNote({ sourceText, responseText, createdAt }: PremiumNoteProps) {
  const dateLine = formatNoteDate(createdAt)

  return (
    <article className={styles.card}>
      {dateLine ? <p className={styles.meta}>{dateLine}</p> : null}

      <div className={styles.sourceBlock}>
        <p className={styles.sourceLabel}>Источник</p>
        <p className={styles.sourceText}>{sourceText || "—"}</p>
      </div>

      <FeatherDivider />

      <div className={styles.responseBlock}>
        <p className={styles.responseLabel}>Отклик</p>
        <p className={styles.responseText}>{responseText || "—"}</p>
      </div>
    </article>
  )
}
