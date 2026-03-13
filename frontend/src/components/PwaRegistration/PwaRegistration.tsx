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
          // Ignore update errors; browser will retry on next navigation.
        })
      } catch {
        // Service worker registration can fail in unsupported/private contexts.
      }
    }

    registerServiceWorker()
  }, [])

  return null
}
