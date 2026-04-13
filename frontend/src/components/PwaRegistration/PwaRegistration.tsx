"use client"

import { useEffect } from "react"

export default function PwaRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    if (!("serviceWorker" in navigator)) {
      return
    }

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        })

        registration.update().catch(() => {
          // Ігноруємо помилки оновлення; браузер повторить спробу при наступній навігації.
        })
      } catch {
        // Реєстрація service worker може впасти в непідтримуваних/приватних контекстах.
      }
    }

    registerServiceWorker()
  }, [])

  return null
}
