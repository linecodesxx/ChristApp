"use client"

import { useEffect } from "react"
import { useRandomVerse } from "@/hooks/useRandomVerse"
import styles from "./RandomVerseWidget.module.scss"
import { Volume2, ChevronRight } from "lucide-react"

export default function RandomVerseWidget() {
  const { verse, isLoading, error, getRandomVerse } = useRandomVerse()

  useEffect(() => {
    getRandomVerse("NRT")
  }, [getRandomVerse])

  const handleGetNewVerse = () => {
    getRandomVerse("NRT")
  }

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.skeleton} />
      </div>
    )
  }

  if (error || !verse) {
    return null
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.icon}>
            <Volume2 size={20} />
          </div>
          <div className={styles.title}>
            <p className={styles.label}>Случайный стих</p>
            <p className={styles.reference}>
              {verse.book} {verse.chapter}:{verse.verse}
            </p>
          </div>
        </div>

        <p className={styles.text}>{verse.text}</p>

        <button onClick={handleGetNewVerse} className={styles.getNewButton}>
          Получить новый стих
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

