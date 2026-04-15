"use client"

import { useEffect, useMemo } from "react"
import { useLocale, useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import { useRandomVerse } from "@/hooks/useRandomVerse"
import styles from "./RandomVerseWidget.module.scss"
import { ScriptureText } from "@/components/ScriptureText/ScriptureText"
import { Volume2, ChevronRight } from "lucide-react"
import {
  bibleStaticQueryOptions,
  bibleTranslationsQueryKey,
  fetchBibleTranslationsForQuery,
  type BibleTranslationItem,
} from "@/lib/queries/bibleQueries"
import { pickTranslationShortName } from "@/lib/bibleTranslationForLang"

type RandomVerseWidgetProps = {
  /** У блоці привітання на дашборді: без зайвих зовнішніх відступів. */
  embedInGreeting?: boolean
}

export default function RandomVerseWidget({ embedInGreeting }: RandomVerseWidgetProps) {
  const t = useTranslations("randomVerse")
  const lang = useLocale()
  const { verse, isLoading, error, getRandomVerse } = useRandomVerse()

  const { data: translations = [] } = useQuery({
    queryKey: bibleTranslationsQueryKey,
    queryFn: fetchBibleTranslationsForQuery,
    ...bibleStaticQueryOptions,
  })

  const bibleTranslation = useMemo(() => {
    if (lang === "en") {
      return "NKJV"
    }
    return pickTranslationShortName(translations as BibleTranslationItem[], lang)
  }, [lang, translations])

  useEffect(() => {
    if (!bibleTranslation) {
      return
    }
    void getRandomVerse(bibleTranslation)
  }, [bibleTranslation, getRandomVerse])

  const handleGetNewVerse = () => {
    void getRandomVerse(bibleTranslation)
  }

  const rootClass = embedInGreeting ? `${styles.container} ${styles.embedInGreeting}` : styles.container

  if (isLoading) {
    return (
      <div className={rootClass}>
        <div className={styles.skeleton} />
      </div>
    )
  }

  if (error || !verse) {
    return null
  }

  return (
    <div className={rootClass}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.icon}>
            <Volume2 size={20} />
          </div>
          <div className={styles.title}>
            <p className={styles.label}>{t("cardLabel")}</p>
            <p className={styles.reference}>
              {verse.book} {verse.chapter}:{verse.verse}
            </p>
          </div>
        </div>

        <ScriptureText html={verse.text} className={styles.text} />

        <button type="button" onClick={handleGetNewVerse} className={styles.getNewButton}>
          {t("refresh")}
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
