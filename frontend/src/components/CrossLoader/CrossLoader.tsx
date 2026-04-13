import styles from "./CrossLoader.module.scss"

export type CrossLoaderProps = {
  className?: string
  /** Текст для скринрідерів */
  label?: string
  /** fullscreen — на всю доступну висоту контенту; inline — компактний блок */
  variant?: "fullscreen" | "inline"
}

/**
 * Заглушка завантаження: анімація промальовування золотого хреста (SVG + stroke-dashoffset).
 * Довжина контуру задана через pathLength — без JS, коректно при SSR.
 */
export default function CrossLoader({
  className,
  label = "Загрузка",
  variant = "inline",
}: CrossLoaderProps) {
  const rootClass =
    `${styles.container} ${variant === "fullscreen" ? styles.fullscreen : styles.inline}` +
    (className ? ` ${className}` : "")

  return (
    <div className={rootClass} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.visuallyHidden}>{label}</span>
      <svg
        className={styles.cross}
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        focusable="false"
      >
        <path
          className={styles.path}
          pathLength={100}
          d="M 50,10 V 90 M 20,40 H 80"
        />
      </svg>
    </div>
  )
}
