const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export type PushServerStatus = {
  enabled: boolean
  hasSubscription: boolean
  subscriptionsCount: number
}

export type PushPublicKeyResponse = {
  enabled: boolean
  publicKey: string | null
}

export type UnreadSummaryResponse = {
  totalUnread: number
  rooms: Array<{
    roomId: string
    unread: number
  }>
}

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
    const response = await fetch(`${API_URL}/push/status`, {
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
    const response = await fetch(`${API_URL}/push/unread-summary`, {
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

export async function syncBrowserPushSubscription(token: string) {
  if (!isPushSupportedInBrowser()) {
    return { success: false as const, reason: 'unsupported' as const }
  }

  if (Notification.permission !== 'granted') {
    return { success: false as const, reason: 'permission-not-granted' as const }
  }

  try {
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      const publicKeyResponse = await fetch(`${API_URL}/push/public-key`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      })

      if (!publicKeyResponse.ok) {
        return { success: false as const, reason: 'public-key-fetch-failed' as const }
      }

      const publicKeyPayload = (await publicKeyResponse.json()) as PushPublicKeyResponse
      if (!publicKeyPayload.enabled || !publicKeyPayload.publicKey) {
        return { success: false as const, reason: 'server-disabled' as const }
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKeyPayload.publicKey),
      })
    }

    const payload = subscriptionToPayload(subscription)
    if (!payload) {
      return { success: false as const, reason: 'invalid-subscription' as const }
    }

    const subscribeResponse = await fetch(`${API_URL}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    if (!subscribeResponse.ok) {
      return { success: false as const, reason: 'subscribe-request-failed' as const }
    }

    return { success: true as const }
  } catch {
    return { success: false as const, reason: 'unexpected-error' as const }
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
