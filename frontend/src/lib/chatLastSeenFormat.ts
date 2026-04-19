/** Відносний текст «був у мережі» для списку чатів (без next-intl — передавайте готові рядки з `t`). */
export function formatLastSeenRelative(
  iso: string,
  nowMs: number,
  labels: { seconds: (n: number) => string; minutes: (n: number) => string; hours: (n: number) => string; days: (n: number) => string },
): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) {
    return ""
  }
  const diffMs = Math.max(0, nowMs - t)
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) {
    return labels.seconds(Math.max(1, sec))
  }
  const min = Math.floor(sec / 60)
  if (min < 60) {
    return labels.minutes(Math.max(1, min))
  }
  const hours = Math.floor(min / 60)
  if (hours < 24) {
    return labels.hours(Math.max(1, hours))
  }
  const days = Math.floor(hours / 24)
  return labels.days(Math.max(1, days))
}
