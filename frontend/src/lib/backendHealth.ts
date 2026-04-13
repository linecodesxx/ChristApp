import { apiFetch } from "@/lib/apiFetch"

type HealthJson = {
  ok?: boolean
}

/**
 * Чи доступний HTTP API (зокрема після cold start на Render/Railway тощо).
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
