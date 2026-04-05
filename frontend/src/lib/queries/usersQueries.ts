import { getHttpApiBase } from "@/lib/apiBase"
import { getAuthToken } from "@/lib/auth"
import { apiFetch } from "@/lib/apiFetch"

const API_URL = getHttpApiBase()

export function usersDirectoryQueryKey() {
  return ["users", "directory"] as const
}

export async function fetchUsersDirectory(): Promise<
  Array<Record<string, unknown> & { id: string }>
> {
  const token = getAuthToken()
  if (!token) {
    return []
  }

  const res = await apiFetch(`${API_URL}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    return []
  }

  const data: unknown = await res.json()
  return Array.isArray(data) ? (data as Array<Record<string, unknown> & { id: string }>) : []
}
