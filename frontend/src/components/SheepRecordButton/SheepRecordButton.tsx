"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useRef } from "react"
import styles from "./SheepRecordButton.module.scss"

type SheepRecordButtonProps = {
  mode: "voice" | "sheep"
  disabled?: boolean
  isRecording?: boolean
  onToggleMode: () => void
  onLongPressStart: () => void | Promise<void>
  onLongPressEnd: () => void | Promise<void>
}

const LONG_PRESS_MS = 280

export default function SheepRecordButton({
  mode,
  disabled = false,
  isRecording = false,
  onToggleMode,
  onLongPressStart,
  onLongPressEnd,
}: SheepRecordButtonProps) {
  const timerRef = useRef<number | null>(null)
  const longPressActiveRef = useRef(false)

  const clearPressTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const finishPress = () => {
    clearPressTimer()
    if (longPressActiveRef.current) {
      longPressActiveRef.current = false
      void onLongPressEnd()
      return
    }
    onToggleMode()
  }

  return (
    <button
      type="button"
      className={styles.recordButton}
      aria-label={mode === "voice" ? "Режим голоса" : "Режим видео-овечки"}
      title={mode === "voice" ? "Голос" : "Видео-овечка"}
      disabled={disabled}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (disabled) return
        event.preventDefault()
        longPressActiveRef.current = false
        clearPressTimer()
        timerRef.current = window.setTimeout(() => {
          longPressActiveRef.current = true
          void onLongPressStart()
        }, LONG_PRESS_MS)
      }}
      onPointerUp={(event) => {
        if (disabled) return
        event.preventDefault()
        finishPress()
      }}
      onPointerCancel={() => {
        if (disabled) return
        finishPress()
      }}
      onPointerLeave={() => {
        if (disabled) return
        if (!longPressActiveRef.current) {
          clearPressTimer()
        }
      }}
    >
      {isRecording ? <span className={styles.recordPulse} aria-hidden /> : null}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={mode}
          className={styles.icon}
          initial={{ opacity: 0, y: 6, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.9 }}
          transition={{ duration: 0.17, ease: "easeOut" }}
          aria-hidden
        >
          {mode === "voice" ? (
            <svg
              className={styles.micIcon}
              width="36"
              height="36"
              viewBox="0 0 36 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M18 23.8333V26.3333" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M23.8333 16.3333V17.9999C23.8333 19.547 23.2187 21.0307 22.1248 22.1247C21.0308 23.2187 19.5471 23.8333 18 23.8333C16.4529 23.8333 14.9692 23.2187 13.8752 22.1247C12.7812 21.0307 12.1667 19.547 12.1667 17.9999V16.3333" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20.5 12.1667C20.5 10.786 19.3807 9.66675 18 9.66675C16.6193 9.66675 15.5 10.786 15.5 12.1667V18.0001C15.5 19.3808 16.6193 20.5001 18 20.5001C19.3807 20.5001 20.5 19.3808 20.5 18.0001V12.1667Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg
              width="32"
              height="32"
              viewBox="0 0 36 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Ears (behind everything) */}
              <circle cx="9" cy="20" r="6" fill="#C8BFB0" />
              <circle cx="27" cy="20" r="6" fill="#C8BFB0" />
              <circle cx="9" cy="20" r="3.5" fill="#EAC9C0" />
              <circle cx="27" cy="20" r="3.5" fill="#EAC9C0" />
              {/* Fluffy wool head */}
              <circle cx="14" cy="11" r="7" fill="#EDE7DC" />
              <circle cx="18" cy="8" r="8" fill="#EDE7DC" />
              <circle cx="22" cy="11" r="7" fill="#EDE7DC" />
              <circle cx="18" cy="18" r="9" fill="#EDE7DC" />
              {/* Dark face */}
              <ellipse cx="18" cy="23" rx="6.5" ry="7.5" fill="#2D1B0E" />
              {/* Eyes */}
              <circle cx="15" cy="21" r="2" fill="white" />
              <circle cx="21" cy="21" r="2" fill="white" />
              <circle cx="15.6" cy="21.5" r="1" fill="#111" />
              <circle cx="21.6" cy="21.5" r="1" fill="#111" />
              {/* Nose */}
              <ellipse cx="18" cy="25.5" rx="2.5" ry="1.5" fill="#5C3018" />
            </svg>
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}
