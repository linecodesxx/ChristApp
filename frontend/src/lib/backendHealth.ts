import { apiFetch } from "@/lib/apiFetch"

type HealthJson = {
  ok?: boolean
}

/**
 * Доступен ли HTTP API (в т.ч. после cold start на Render/Railway и т.п.).
 */
export async function checkBackendHealth(apiBase: string, timeoutMs = 16_000): Promise<boolean> {
  const base = apiBase.replace(/\/+$/, "")
  const url = `${base}/health`
  try {
    const res = await apiFetch(url, { method: "GET", timeoutMs })
    if (!res.ok) {
      return false
    }
    const ct = res.headers.get("content-type") ?? ""
    if (ct.includes("application/json")) {
      const body = (await res.json().catch(() => null)) as HealthJson | null
      return body?.ok === true
    }
    return true
  } catch {
    return false
  }
}
