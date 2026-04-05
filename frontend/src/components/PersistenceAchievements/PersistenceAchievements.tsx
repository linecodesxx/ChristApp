"use client"

import { motion } from "framer-motion"
import { useLayoutEffect, useRef, useState } from "react"
import styles from "./PersistenceAchievements.module.scss"

export const PERSISTENCE_ACHIEVEMENTS = [
  {
    id: "first-step",
    days: 3,
    title: "Первый шаг",
    description: "Зайти в приложение 3 дня подряд.",
    prestige: false,
  },
  {
    id: "week-light",
    days: 7,
    title: "Свет недели",
    description: "7 дней без перерывов.",
    prestige: false,
  },
  {
    id: "month-spirit",
    days: 30,
    title: "Месяц в духе",
    description: "30 дней активности.",
    prestige: false,
  },
  {
    id: "fire-keeper",
    days: 100,
    title: "Хранитель огня",
    description: "100 дней — самая престижная награда.",
    prestige: true,
  },
] as const

export function countUnlockedPersistenceAchievements(streak: number): number {
  return PERSISTENCE_ACHIEVEMENTS.filter((a) => streak >= a.days).length
}

type PersistenceAchievementsProps = {
  dayStreak: number
}

export default function PersistenceAchievements({ dayStreak }: PersistenceAchievementsProps) {
  const prevStreakRef = useRef<number | null>(null)
  const [unlockFlashes, setUnlockFlashes] = useState<Record<string, boolean>>({})

  useLayoutEffect(() => {
    const prev = prevStreakRef.current
    prevStreakRef.current = dayStreak
    if (prev === null) {
      return
    }

    const timers: number[] = []
    for (const a of PERSISTENCE_ACHIEVEMENTS) {
      if (prev < a.days && dayStreak >= a.days) {
        setUnlockFlashes((s) => ({ ...s, [a.id]: true }))
        timers.push(
          window.setTimeout(() => {
            setUnlockFlashes((s) => ({ ...s, [a.id]: false }))
          }, 2200),
        )
      }
    }
    return () => {
      for (const t of timers) {
        window.clearTimeout(t)
      }
    }
  }, [dayStreak])

  return (
    <section className={styles.section} aria-labelledby="persistence-heading">
      <div className={styles.sectionHead}>
        <h2 id="persistence-heading" className={styles.sectionTitle}>
          Постоянство
        </h2>
        <p className={styles.sectionSubtitle}>Стрики</p>
      </div>
      <div className={styles.grid}>
        {PERSISTENCE_ACHIEVEMENTS.map((a) => {
          const isActive = dayStreak >= a.days
          const justUnlocked = Boolean(unlockFlashes[a.id])
          const prestige = a.prestige

          return (
            <motion.article
              key={a.id}
              className={styles.cardMotion}
              initial={false}
              animate={
                isActive
                  ? {
                      opacity: 1,
                      scale: 1,
                    }
                  : {
                      opacity: 0.88,
                      scale: 1,
                    }
              }
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
            >
              <div
                className={[
                  styles.cardShell,
                  isActive ? styles.active : styles.inactive,
                  prestige ? styles.prestige : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {isActive ? <div className={styles.ringSpin} aria-hidden /> : null}

                {justUnlocked ? (
                  <motion.div
                    className={styles.glowBirth}
                    initial={{ opacity: 0, scale: 0.35 }}
                    animate={{
                      opacity: [0, 0.95, 0.55, 0],
                      scale: [0.35, 1.05, 1.2, 1.35],
                    }}
                    transition={{
                      duration: 1.35,
                      ease: [0.22, 1, 0.36, 1],
                      times: [0, 0.35, 0.65, 1],
                    }}
                    aria-hidden
                  />
                ) : null}

                <div className={styles.cardInner}>
                  <div className={styles.iconWrap} aria-hidden>
                    <FlameIcon />
                  </div>

                  <motion.span
                    className={styles.dayDigit}
                    animate={
                      justUnlocked
                        ? { scale: [1, 1.1, 1] }
                        : { scale: 1 }
                    }
                    transition={{
                      duration: 0.65,
                      ease: [0.34, 1.2, 0.64, 1],
                      times: [0, 0.45, 1],
                    }}
                  >
                    {a.days}
                  </motion.span>

                  <h3 className={styles.cardTitle}>{a.title}</h3>
                  <p className={styles.cardDesc}>{a.description}</p>
                  {!isActive ? (
                    <p className={styles.lockHint}>
                      Ещё {Math.max(0, a.days - dayStreak)} дн.
                    </p>
                  ) : null}
                </div>
              </div>
            </motion.article>
          )
        })}
      </div>
    </section>
  )
}

function FlameIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2s2.5 3.2 2.5 6.2c0 1.6-.6 2.8-1.4 3.8.9-.3 1.9-1.1 2.4-2.6.3 1.1.5 2.3.5 3.6 0 4.4-3.6 8-8 8s-8-3.6-8-8c0-3.1 1.7-5.8 4.2-7.2C6 7.5 6.5 9.5 8 11c-.5-2 0-4.2 1.5-6.5C11 6.2 12 2 12 2Z"
        fill="currentColor"
        opacity="0.92"
      />
      <path
        d="M12 14.5c-1.2 0-2.2 1-2.2 2.2s1 2.3 2.2 2.3 2.3-1 2.3-2.3-1-2.2-2.3-2.2Z"
        fill="currentColor"
        opacity="0.35"
      />
    </svg>
  )
}
