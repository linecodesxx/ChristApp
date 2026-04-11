"use client"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import {
  dailyBreadQueryKey,
  fetchDailyBreadForQuery,
} from "@/lib/queries/dailyBreadQueries"
import {
  bibleStaticQueryOptions,
  bibleTranslationsQueryKey,
  fetchBibleTranslationsForQuery,
  type BibleTranslationItem,
} from "@/lib/queries/bibleQueries"
import { pickTranslationShortName } from "@/lib/bibleTranslationForLocale"
import styles from "./DailyBreadEnvelope.module.scss"
import { ScriptureText } from "@/components/ScriptureText/ScriptureText"

export default function DailyBreadEnvelope() {
  const t = useTranslations("dailyBread")
  const locale = useLocale()
  const [open, setOpen] = useState(false)

  const { data: translations = [] } = useQuery({
    queryKey: bibleTranslationsQueryKey,
    queryFn: fetchBibleTranslationsForQuery,
    ...bibleStaticQueryOptions,
  })

  const bibleTranslation = useMemo(
    () => pickTranslationShortName(translations as BibleTranslationItem[], locale),
    [locale, translations],
  )

  const { data, isLoading, isError } = useQuery({
    queryKey: dailyBreadQueryKey(bibleTranslation),
    queryFn: () => fetchDailyBreadForQuery(bibleTranslation),
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 48,
    enabled: Boolean(bibleTranslation),
  })

  const reference =
    data != null ? `${data.book} · ${data.chapter}:${data.verse}` : ""

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
            <span className={styles.sealLabel}>{open ? t("close") : t("open")}</span>
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
              <p className={styles.loading}>{t("loading")}</p>
            ) : isError || !data ? (
              <p className={styles.error}>{t("error")}</p>
            ) : (
              <>
                <p className={styles.reference}>{reference}</p>
                <ScriptureText html={data.text} className={styles.text} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
