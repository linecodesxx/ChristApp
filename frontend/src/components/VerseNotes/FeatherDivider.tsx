import styles from "./FeatherDivider.module.scss"

/** Тонкий разделитель с символом пера — вместо грубой линии */
export default function FeatherDivider({
  className,
  active = false,
}: {
  className?: string
  /** Подсветка при наборе текста в форме заметки */
  active?: boolean
}) {
  return (
    <div
      className={`${styles.root} ${active ? styles.rootActive : ""} ${className ?? ""}`}
      role="separator"
      aria-hidden
    >
      <span className={styles.line} />
      <svg className={styles.feather} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5l6.74-6.76z"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16 8L2 22"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.85"
        />
        <path
          d="M17.5 15H11"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.6"
        />
      </svg>
      <span className={styles.line} />
    </div>
  )
}
