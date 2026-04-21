"use client"

import styles from "./VideoNoteScene.module.scss"

type VideoNoteSceneProps = {
  open: boolean
  isRecording: boolean
  isUploading: boolean
  elapsedSeconds: number
  maxDurationSeconds: number
  facingMode: "user" | "environment"
  previewVideoRef: React.MutableRefObject<HTMLVideoElement | null>
  onSwitchCamera: () => void | Promise<void>
  onStop: () => void | Promise<void>
  onClose: () => void | Promise<void>
}

function formatSeconds(seconds: number) {
  const safe = Math.max(0, seconds)
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
}

export default function VideoNoteScene({
  open,
  isRecording,
  isUploading,
  elapsedSeconds,
  maxDurationSeconds,
  facingMode,
  previewVideoRef,
  onSwitchCamera,
  onStop,
  onClose,
}: VideoNoteSceneProps) {
  if (!open) return null

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Запись видео-овечки">
      <div className={styles.backdrop} onClick={() => void onClose()} />
      <div className={styles.stage}>
        <div className={`${styles.sheepFrame}${isRecording ? ` ${styles.sheepFrameRecording}` : ""}`}>
          <span className={`${styles.ear} ${styles.earLeft}`} aria-hidden />
          <span className={`${styles.ear} ${styles.earRight}`} aria-hidden />
          <video ref={previewVideoRef} className={styles.preview} autoPlay muted playsInline />
          <button
            type="button"
            className={styles.switchCameraButton}
            onClick={() => void onSwitchCamera()}
            disabled={isUploading || isRecording}
            aria-label="Переворот камеры"
            title={facingMode === "user" ? "Фронтальная камера" : "Задняя камера"}
          >
            ↺
          </button>
          <div className={styles.timerBar} aria-live="polite">
            <span className={`${styles.recordDot}${isRecording ? ` ${styles.recordDotPulse}` : ""}`} aria-hidden />
            <span>{formatSeconds(elapsedSeconds)}</span>
            <span className={styles.timerDivider}>/</span>
            <span>{formatSeconds(maxDurationSeconds)}</span>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void onClose()}
            disabled={isUploading}
          >
            Отмена
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void onStop()}
            disabled={isUploading || !isRecording}
          >
            {isUploading ? "Отправка..." : "Отправить"}
          </button>
        </div>
      </div>
    </div>
  )
}
