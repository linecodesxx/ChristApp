"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { getHttpApiBase } from "@/lib/apiBase"
import { checkBackendHealth } from "@/lib/backendHealth"

const POLL_MS = 7000

function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m <= 0) {
    return `${s} сек`
  }
  return `${m} мин ${String(s).padStart(2, "0")} сек`
}

function hintForElapsed(totalSec: number): string {
  if (totalSec < 90) {
    return "На бесплатных тарифах хостинга «пробуждение» сервера после простоя обычно занимает 1–3 минуты."
  }
  if (totalSec < 240) {
    return "Запуск иногда ближе к 3–4 минутам — страница сама обновит статус, как только API ответит."
  }
  return "Если прошло больше 5 минут, проверьте панель хостинга или адрес API (NEXT_PUBLIC_API_URL)."
}

export function useBackendWarmupStatus(enabled: boolean) {
  const apiBase = useMemo(() => getHttpApiBase(), [])
  const [reachable, setReachable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(true)
  const waitStartedAtRef = useRef<number | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) {
      return
    }
    const id = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let cancelled = false

    const run = async () => {
      const ok = await checkBackendHealth(apiBase)
      if (cancelled) {
        return
      }
      if (ok) {
        setReachable(true)
        setChecking(false)
        waitStartedAtRef.current = null
        return
      }
      if (waitStartedAtRef.current == null) {
        waitStartedAtRef.current = Date.now()
      }
      setReachable(false)
      setChecking(false)
    }

    void run()
    const interval = window.setInterval(() => void run(), POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [enabled, apiBase])

  const elapsedSec =
    reachable === false && waitStartedAtRef.current != null
      ? Math.max(0, Math.floor((Date.now() - waitStartedAtRef.current) / 1000))
      : 0

  return {
    /** null — ещё ни разу не закончили первую проверку */
    reachable,
    checking,
    elapsedLabel: formatElapsed(elapsedSec),
    hint: hintForElapsed(elapsedSec),
    showPanel: checking || reachable === false,
  }
}
