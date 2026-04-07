"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  dailyBreadQueryKey,
  fetchDailyBreadForQuery,
} from "@/lib/queries/dailyBreadQueries"
import styles from "./DailyBreadEnvelope.module.scss"

export default function DailyBreadEnvelope() {
  const [open, setOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: dailyBreadQueryKey,
    queryFn: fetchDailyBreadForQuery,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 48,
  })

  const reference =
    data != null
      ? `${data.book} · ${data.chapter}:${data.verse}`
      : ""

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.sealWrap}>
          <button
            type="button"
            className={styles.seal}
            aria-expanded={open}
            aria-controls="daily-bread-verse"
            id="daily-bread-seal"
            onClick={() => setOpen((v) => !v)}
          >
            <span className={styles.sealLabel}>
              {open ? "Закрыть стих дня" : "Открыть стих дня"}
            </span>
            <span className={styles.sealInner} aria-hidden />
          </button>
        </div>

        <div
          id="daily-bread-verse"
          className={`${styles.verseShell} ${open ? styles.verseShellOpen : ""}`}
          aria-hidden={!open}
        >
          <div className={styles.verseInner}>
            {isLoading ? (
              <p className={styles.loading}>Загрузка…</p>
            ) : isError || !data ? (
              <p className={styles.error}>Не удалось загрузить стих. Попробуйте позже.</p>
            ) : (
              <>
                <p className={styles.reference}>{reference}</p>
                <p className={styles.text}>{data.text}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
