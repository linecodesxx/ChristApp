"use client"

import { useLocale } from "next-intl"
import { useEffect } from "react"

/** Синхронізує `document.documentElement.lang` з активною локаллю next-intl. */
export default function HtmlLang() {
  const lang = useLocale()

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return null
}
