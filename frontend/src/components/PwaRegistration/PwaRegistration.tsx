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

    let didRefresh = false

    const onControllerChange = () => {
      if (didRefresh) {
        return
      }
      didRefresh = true
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)

    const activateWaitingWorker = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" })
      }
    }

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        })

        activateWaitingWorker(registration)

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing
          if (!installing) {
            return
          }

          installing.addEventListener("statechange", () => {
            if (installing.state === "installed") {
              activateWaitingWorker(registration)
            }
          })
        })

        registration.update().catch(() => {
          // Ігноруємо помилки оновлення; браузер повторить спробу при наступній навігації.
        })
      } catch {
        // Реєстрація service worker може впасти в непідтримуваних/приватних контекстах.
      }
    }

    registerServiceWorker()

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
    }
  }, [])

  return null
}
