"use client"

import { useLocale } from "next-intl"
import { useEffect } from "react"

/** Синхронизирует `document.documentElement.lang` с активной локалью next-intl. */
export default function HtmlLang() {
  const locale = useLocale()

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return null
}
