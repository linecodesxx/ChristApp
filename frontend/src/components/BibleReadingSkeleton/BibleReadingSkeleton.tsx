import styles from "./BibleReadingSkeleton.module.scss"

type BibleReadingSkeletonProps = {
  /** Повна висота екрана (маршрут loading / стара сторінка глави). */
  variant?: "fullscreen" | "embedded"
  /** Лише смужки по центру — для кореневого app/loading за будь-яких переходів. */
  minimal?: boolean
}

export default function BibleReadingSkeleton({
  variant = "embedded",
  minimal = false,
}: BibleReadingSkeletonProps) {
  const rootClass = [
    styles.root,
    variant === "fullscreen" ? styles.fullscreen : "",
    minimal ? styles.minimalRoot : "",
  ]
    .filter(Boolean)
    .join(" ")

  if (minimal) {
    const widths = [100, 92, 88, 94, 80]
    return (
      <div
        className={rootClass}
        aria-busy="true"
        aria-label="Загрузка"
      >
        {widths.map((w, i) => (
          <div
            key={i}
            className={`${styles.minimalBar} ${styles.shimmer}`}
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={rootClass}
      aria-busy="true"
      aria-label="Загрузка текста Библии"
    >
      <div className={styles.header}>
        <div className={`${styles.titlePill} ${styles.shimmer}`} />
        <div className={`${styles.selectPill} ${styles.shimmer}`} />
      </div>
      <div className={styles.lines}>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className={`${styles.line} ${styles.shimmer}`} />
        ))}
      </div>
    </div>
  )
}
