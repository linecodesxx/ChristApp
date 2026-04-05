import { getHttpApiBase } from "@/lib/apiBase"
import { apiFetch } from "@/lib/apiFetch"

/** Без завершающего `/`, иначе получится `//push/...` и часть прокси отдаёт 404/500. */
const API_URL = getHttpApiBase().replace(/\/+$/, "")

export type PushServerStatus = {
  enabled: boolean
  hasSubscription: boolean
  subscriptionsCount: number
}

export type PushPublicKeyResponse = {
  enabled: boolean
  publicKey: string | null
}

export type UnreadSummaryRoomLastMessage = {
  id: string
  content: string
  createdAt: string
  senderId: string
  senderUsername: string
}

export type UnreadSummaryRoom = {
  roomId: string
  unread: number
  lastMessage: UnreadSummaryRoomLastMessage | null
}

export type UnreadSummaryResponse = {
  totalUnread: number
  rooms: UnreadSummaryRoom[]
}

export type PushSyncFailureReason =
  | 'unsupported'
  | 'permission-not-granted'
  | 'public-key-fetch-failed'
  | 'server-disabled'
  | 'invalid-subscription'
  | 'subscribe-request-failed'
  | 'unexpected-error'

export type PushSyncResult =
  | { success: true }
  | { success: false; reason: PushSyncFailureReason }

export function isPushSupportedInBrowser() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export async function hasActivePushSubscription() {
  if (!isPushSupportedInBrowser()) {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return Boolean(subscription)
  } catch {
    return false
  }
}

export async function fetchPushStatus(token: string): Promise<PushServerStatus | null> {
  try {
    const response = await apiFetch(`${API_URL}/push/status`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as PushServerStatus
  } catch {
    return null
  }
}

export async function fetchUnreadSummary(token: string): Promise<UnreadSummaryResponse | null> {
  try {
    const response = await apiFetch(`${API_URL}/push/unread-summary`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as UnreadSummaryResponse
  } catch {
    return null
  }
}

export async function fetchUnreadSummaryOrThrow(token: string): Promise<UnreadSummaryResponse> {
  const summary = await fetchUnreadSummary(token)
  if (!summary) {
    throw new Error("Не удалось получить unread-summary")
  }
  return summary
}

export function getPushSyncErrorMessage(reason: PushSyncFailureReason) {
  switch (reason) {
    case 'unsupported':
      return 'Устройство или браузер не поддерживает Push API.'
    case 'permission-not-granted':
      return 'Браузер не выдал разрешение на уведомления.'
    case 'public-key-fetch-failed':
      return 'Не удалось получить push-ключ с сервера.'
    case 'server-disabled':
      return 'Push на сервере отключен или не настроен.'
    case 'invalid-subscription':
      return 'Браузер вернул некорректную push-подписку.'
    case 'subscribe-request-failed':
      return 'Сервер не принял push-подписку.'
    default:
      return 'Не удалось подключить push из-за непредвиденной ошибки.'
  }
}

export async function syncBrowserPushSubscription(token: string): Promise<PushSyncResult> {
  if (!isPushSupportedInBrowser()) {
    return { success: false, reason: 'unsupported' }
  }

  if (Notification.permission !== 'granted') {
    return { success: false, reason: 'permission-not-granted' }
  }

  try {
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      const publicKeyResponse = await apiFetch(`${API_URL}/push/public-key`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      })

      if (!publicKeyResponse.ok) {
        return { success: false, reason: 'public-key-fetch-failed' }
      }

      const publicKeyPayload = (await publicKeyResponse.json()) as PushPublicKeyResponse
      if (!publicKeyPayload.enabled || !publicKeyPayload.publicKey) {
        return { success: false, reason: 'server-disabled' }
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKeyPayload.publicKey),
      })
    }

    const payload = subscriptionToPayload(subscription)
    if (!payload) {
      return { success: false, reason: 'invalid-subscription' }
    }

    const subscribeResponse = await apiFetch(`${API_URL}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    if (!subscribeResponse.ok) {
      return { success: false, reason: 'subscribe-request-failed' }
    }

    return { success: true }
  } catch {
    return { success: false, reason: 'unexpected-error' }
  }
}

function subscriptionToPayload(subscription: PushSubscription) {
  const json = subscription.toJSON()
  const endpoint = json.endpoint ?? subscription.endpoint
  const keys = json.keys

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return null
  }

  return {
    endpoint,
    expirationTime: typeof json.expirationTime === 'number' ? json.expirationTime : null,
    keys: {
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const normalized = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(normalized)
  const outputArray = new Uint8Array(rawData.length)

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }

  return outputArray
}
