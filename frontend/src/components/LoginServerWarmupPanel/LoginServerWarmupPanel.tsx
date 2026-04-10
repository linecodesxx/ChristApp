"use client"

import { useBackendWarmupStatus } from "@/hooks/useBackendWarmupStatus"
import styles from "./LoginServerWarmupPanel.module.scss"

type LoginServerWarmupPanelProps = {
  enabled?: boolean
}

export default function LoginServerWarmupPanel({ enabled = true }: LoginServerWarmupPanelProps) {
  const { reachable, checking, elapsedLabel, hint, showPanel } = useBackendWarmupStatus(enabled)

  if (!showPanel) {
    return null
  }

  return (
    <div
      className={`${styles.panel} ${reachable === false ? styles.panelWarning : styles.panelNeutral}`}
      role="status"
      aria-live="polite"
    >
      <div className={styles.header}>
        <span
          className={`${styles.dot} ${checking ? styles.dotChecking : reachable === false ? styles.dotWarning : styles.dotNeutral}`}
          aria-hidden
        />
        <p className={styles.title}>{checking ? "Подключаемся к серверу" : "Сервер запускается или недоступен"}</p>
      </div>

      {checking ? (
        <>
          <p className={styles.body}>Проверяем связь с API. Обычно это занимает несколько секунд.</p>
          <p className={styles.footer}>Не закрывайте страницу, проверка продолжается автоматически.</p>
        </>
      ) : (
        <>
          <p className={styles.body}>{hint}</p>
          <p className={styles.timer}>
            Ждём ответа уже: <strong>{elapsedLabel}</strong>
          </p>
          <p className={styles.footer}>Проверка повторяется автоматически каждые несколько секунд.</p>
          <a href="/offline" className={styles.offlineLink}>
            Открыть офлайн-экран
          </a>
        </>
      )}
    </div>
  )
}
