/** Лічильник на іконці PWA (Badging API). Підтримується не всюди (часто лише встановлене PWA). */

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

export async function syncAppBadgeFromUnreadCount(totalUnread: number) {
  if (typeof navigator === "undefined") {
    return
  }

  const nav = navigator as BadgeNavigator
  if (typeof nav.setAppBadge !== "function") {
    return
  }

  try {
    if (totalUnread > 0) {
      await nav.setAppBadge(Math.min(totalUnread, 99))
    } else if (typeof nav.clearAppBadge === "function") {
      await nav.clearAppBadge()
    } else {
      await nav.setAppBadge(0)
    }
  } catch {
    // iOS / звичайний Safari часто не підтримують
  }
}

export async function clearAppBadgeIfSupported() {
  await syncAppBadgeFromUnreadCount(0)
}
