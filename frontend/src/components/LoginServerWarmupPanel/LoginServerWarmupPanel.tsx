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
      {checking ? (
        <>
          <p className={styles.title}>Проверяем сервер…</p>
          <p className={styles.body}>Связь с API, подождите несколько секунд.</p>
        </>
      ) : (
        <>
          <p className={styles.title}>Сервер запускается или недоступен</p>
          <p className={styles.body}>{hint}</p>
          <p className={styles.timer}>
            Ждём ответа уже: <strong>{elapsedLabel}</strong>
          </p>
          <p className={styles.footer}>Проверка повторяется автоматически каждые несколько секунд.</p>
        </>
      )}
    </div>
  )
}
