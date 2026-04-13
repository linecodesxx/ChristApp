const STORAGE_KEY = "christapp_daily_streak_v1"

type StreakState = {
  lastVisitYmd: string
  streak: number
}

function getLocalYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function previousLocalYmd(ymd: string): string {
  const d = parseYmd(ymd)
  d.setDate(d.getDate() - 1)
  return getLocalYmd(d)
}

function readState(): StreakState {
  if (typeof window === "undefined") {
    return { lastVisitYmd: "", streak: 0 }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { lastVisitYmd: "", streak: 0 }
    }
    const parsed = JSON.parse(raw) as Partial<StreakState>
    const lastVisitYmd = typeof parsed.lastVisitYmd === "string" ? parsed.lastVisitYmd : ""
    const streak = typeof parsed.streak === "number" && Number.isFinite(parsed.streak) ? Math.max(0, parsed.streak) : 0
    return { lastVisitYmd, streak }
  } catch {
    return { lastVisitYmd: "", streak: 0 }
  }
}

function writeState(state: StreakState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ігноруємо quota / private mode
  }
}

/**
 * Викликати після авторизації (можна кілька разів за сесію — інкремент не частіше разу на календарний день).
 * Повертає актуальне значення серії після запису.
 */
export function recordDailyVisit(): number {
  if (typeof window === "undefined") {
    return 0
  }

  const today = getLocalYmd(new Date())
  const prev = readState()

  if (prev.lastVisitYmd === today) {
    return Math.max(1, prev.streak)
  }

  let nextStreak: number
  if (!prev.lastVisitYmd) {
    nextStreak = 1
  } else if (prev.lastVisitYmd === previousLocalYmd(today)) {
    nextStreak = Math.max(1, prev.streak) + 1
  } else {
    nextStreak = 1
  }

  writeState({ lastVisitYmd: today, streak: nextStreak })
  return nextStreak
}

/** Поточна серія для UI: сьогодні або вчора (ще не заходили сьогодні, але ланцюжок не обірвано). */
export function getAppStreak(): number {
  const s = readState()
  const today = getLocalYmd(new Date())
  if (!s.lastVisitYmd) {
    return 0
  }
  if (s.lastVisitYmd === today) {
    return Math.max(1, s.streak)
  }
  if (s.lastVisitYmd === previousLocalYmd(today)) {
    return Math.max(1, s.streak)
  }
  return 0
}
