"use client"

import styles from "@/app/offline/offline.module.scss"

function OfflineGlyph() {
  return (
    <svg
      className={styles.mark}
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M2.5 9.5c4-4 10.5-4 14.5 0M5 13c2.8-2.5 6.2-2.5 9 0M7.5 16.5c1.7-1.5 3.8-1.5 5.5 0"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M4 20L20 4"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function OfflinePage() {
  return (
    <div className={styles.wrap}>
      <section className={styles.inner} aria-labelledby="offline-title">
        <OfflineGlyph />
        <h1 id="offline-title" className={styles.title}>
          Нет сети
        </h1>
        <p className={styles.text}>Проверьте подключение и попробуйте снова.</p>
        <button type="button" className={styles.retry} onClick={() => window.location.reload()}>
          Обновить
        </button>
      </section>
    </div>
  )
}
