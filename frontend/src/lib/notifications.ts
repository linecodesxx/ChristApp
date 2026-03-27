import { hasActivePushSubscription } from "@/lib/push"

const REPLY_META_PREFIX = "[[reply:"
const REPLY_META_SUFFIX = "]]"
const VERSE_SHARE_META_PREFIX = "[[verse-share:"
const VERSE_SHARE_META_SUFFIX = "]]"

type ChatNotificationPayload = {
  title: string
  body: string
  targetUrl: string
  tag?: string
}

function stripReplyMetadata(rawBody: string) {
  if (!rawBody.startsWith(REPLY_META_PREFIX)) {
    return rawBody
  }

  const suffixIndex = rawBody.indexOf(REPLY_META_SUFFIX, REPLY_META_PREFIX.length)
  if (suffixIndex === -1) {
    return rawBody
  }

  return rawBody.slice(suffixIndex + REPLY_META_SUFFIX.length)
}

export function normalizeNotificationBody(rawBody: string) {
  const withoutReply = stripReplyMetadata(String(rawBody ?? ""))
  const withoutVerseMeta = withoutReply.startsWith(VERSE_SHARE_META_PREFIX)
    ? (() => {
        const suffixIndex = withoutReply.indexOf(VERSE_SHARE_META_SUFFIX, VERSE_SHARE_META_PREFIX.length)
        if (suffixIndex === -1) return withoutReply
        return withoutReply.slice(suffixIndex + VERSE_SHARE_META_SUFFIX.length)
      })()
    : withoutReply
  return withoutVerseMeta.replace(/\s+/g, " ").trim()
}

function isClientNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window
}

export async function requestNotificationPermissionIfNeeded(): Promise<NotificationPermission> {
  if (!isClientNotificationSupported()) {
    return "denied"
  }

  if (Notification.permission !== "default") {
    return Notification.permission
  }

  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export async function showChatNotification({
  title,
  body,
  targetUrl,
  tag,
}: ChatNotificationPayload): Promise<boolean> {
  if (!isClientNotificationSupported() || Notification.permission !== "granted") {
    return false
  }

  // Если устройство уже подписано на Web Push, уведомление придет из Service Worker.
  // Это защищает от дублей, когда чат открыт во вкладке и сервер тоже отправляет push.
  if (await hasActivePushSubscription()) {
    return false
  }

  const normalizedBody = normalizeNotificationBody(body)
  if (!normalizedBody) {
    return false
  }

  const notificationOptions: NotificationOptions = {
    body: normalizedBody,
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    tag,
    data: {
      url: targetUrl,
    },
  }

  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready
      if (registration?.showNotification) {
        await registration.showNotification(title, notificationOptions)
        return true
      }
    } catch {
      // Fallback to Notification constructor below.
    }
  }

  try {
    const fallbackNotification = new Notification(title, notificationOptions)
    fallbackNotification.onclick = () => {
      window.focus()
      window.location.href = targetUrl
      fallbackNotification.close()
    }
    return true
  } catch {
    return false
  }
}