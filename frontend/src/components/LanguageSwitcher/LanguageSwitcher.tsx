"use client"

import { useLocale, useTranslations } from "next-intl"
import { AnimatePresence, motion } from "framer-motion"
import { useCallback, useEffect, useId, useRef, useState } from "react"
import { usePathname, useRouter } from "@/i18n/navigation"
import { routing } from "@/i18n/routing"
import styles from "./LanguageSwitcher.module.scss"

const LABELS: Record<(typeof routing.locales)[number], string> = {
  en: "EN",
  ru: "RU",
  ua: "UA",
}

type LanguageSwitcherProps = {
  /** Компактний вигляд в один рядок (наприклад, у шапці профілю поруч із шестернею) */
  variant?: "inline"
  /** Після зміни локалі */
  onLocaleChange?: () => void
}

export default function LanguageSwitcher({ variant, onLocaleChange }: LanguageSwitcherProps) {
  const t = useTranslations("languageSwitcher")
  const locale = useLocale() as (typeof routing.locales)[number]
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) {
      return
    }
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        close()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close()
      }
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, close])

  const selectLocale = (next: (typeof routing.locales)[number]) => {
    if (next === locale) {
      close()
      return
    }
    router.replace(pathname, { locale: next })
    close()
    onLocaleChange?.()
  }

  const inline = variant === "inline"

  return (
    <div ref={rootRef} className={inline ? styles.rootInline : styles.root}>
      <motion.button
        type="button"
        className={inline ? `${styles.trigger} ${styles.triggerInline}` : styles.trigger}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={t("label")}
        title={t("current", { code: LABELS[locale] })}
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 520, damping: 32 }}
      >
        <span>{LABELS[locale]}</span>
        <span className={styles.chevron} aria-hidden>
          ▾
        </span>
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={listId}
            role="listbox"
            aria-label={t("label")}
            className={inline ? `${styles.menu} ${styles.menuInline}` : styles.menu}
            initial={{ opacity: 0, y: -6, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {routing.locales.map((code) => (
              <motion.button
                key={code}
                type="button"
                role="option"
                aria-selected={code === locale}
                className={`${styles.option} ${code === locale ? styles.optionActive : ""}`}
                onClick={() => selectLocale(code)}
                whileHover={{ x: 2 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
              >
                {LABELS[code]}
              </motion.button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
