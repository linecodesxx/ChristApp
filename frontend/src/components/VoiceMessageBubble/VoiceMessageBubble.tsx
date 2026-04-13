"use client"

import { useEffect, useRef, useState } from "react"
import { Volume2 } from "lucide-react"
import { type Message } from "@/types/message"
import styles from "./VoiceMessageBubble.module.scss"

type VoiceMessageComponentProps = {
  username: string
  src: string
  isOwn: boolean
  message: Message
}

/**
 * Формує час у форматі MM:SS
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export default function VoiceMessageBubble({
  username,
  src,
  isOwn,
  message,
}: VoiceMessageComponentProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [duration, setDuration] = useState<number>(0)
  const [currentTime, setCurrentTime] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)

    audio.addEventListener("loadedmetadata", handleLoadedMetadata)
    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("play", handlePlay)
    audio.addEventListener("pause", handlePause)
    audio.addEventListener("ended", handleEnded)

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("play", handlePlay)
      audio.removeEventListener("pause", handlePause)
      audio.removeEventListener("ended", handleEnded)
    }
  }, [])

  const durationStr = formatDuration(duration)
  const currentTimeStr = formatDuration(currentTime)

  return (
    <div className={`${styles.voiceMessage} ${isOwn ? styles.voiceMessageOwn : ""}`}>
      <div className={styles.voiceHeader}>
        <div className={styles.voiceIcon}>
          <Volume2 size={20} strokeWidth={2} />
        </div>
        <div className={styles.voiceInfo}>
          <p className={styles.voiceUsername}>
            {username}
            <span style={{ marginLeft: "4px", fontSize: "11px", opacity: "0.6" }}>— голосовое</span>
          </p>
          <div className={styles.voiceDuration}>
            <span className={styles.currentTime}>{currentTimeStr}</span>
            <span className={styles.separator}>/</span>
            <span className={styles.totalTime}>{durationStr}</span>
            {isPlaying && <span style={{ marginLeft: "auto", fontSize: "10px", opacity: "0.7" }}>▶ воспроизведение</span>}
          </div>
        </div>
      </div>

      <audio
        ref={audioRef}
        className={styles.voicePlayer}
        controls
        src={src}
        preload="metadata"
      />
    </div>
  )
}
