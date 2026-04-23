"use client"

import { AnimatePresence, motion } from "framer-motion"
import Image from "next/image"
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
              width="50"
              height="50"
              viewBox="0 0 36 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M18 23.8333V26.3333" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M23.8333 16.3333V17.9999C23.8333 19.547 23.2187 21.0307 22.1248 22.1247C21.0308 23.2187 19.5471 23.8333 18 23.8333C16.4529 23.8333 14.9692 23.2187 13.8752 22.1247C12.7812 21.0307 12.1667 19.547 12.1667 17.9999V16.3333" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20.5 12.1667C20.5 10.786 19.3807 9.66675 18 9.66675C16.6193 9.66675 15.5 10.786 15.5 12.1667V18.0001C15.5 19.3808 16.6193 20.5001 18 20.5001C19.3807 20.5001 20.5 19.3808 20.5 18.0001V12.1667Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <Image src="/sheep.png" alt="Овечка" width={50} height={25} className={styles.sheepIcon} />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}
