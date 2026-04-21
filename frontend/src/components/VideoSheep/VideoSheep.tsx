"use client"

import { useState } from "react"
import styles from "./VideoSheep.module.scss"

type VideoSheepProps = {
  src: string
}

export default function VideoSheep({ src }: VideoSheepProps) {
  const [isMuted, setIsMuted] = useState(true)

  return (
    <button
      type="button"
      className={styles.sheepWrap}
      onClick={(event) => {
        event.stopPropagation()
        setIsMuted((prev) => !prev)
      }}
      data-bubble-control
      aria-label={isMuted ? "Включить звук" : "Выключить звук"}
      title={isMuted ? "Включить звук" : "Выключить звук"}
    >
      <span className={`${styles.ear} ${styles.earLeft}`} aria-hidden />
      <span className={`${styles.ear} ${styles.earRight}`} aria-hidden />
      <video
        className={styles.video}
        src={src}
        autoPlay
        loop
        muted={isMuted}
        playsInline
        preload="metadata"
      />
      <span className={styles.soundBadge} aria-hidden>
        {isMuted ? "🔇" : "🔊"}
      </span>
    </button>
  )
}
