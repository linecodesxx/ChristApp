import { getHttpApiBase } from "@/lib/apiBase"
import { apiFetch } from "@/lib/apiFetch"

const API_URL = getHttpApiBase()

type FetchRoomMessagesParams = {
  token: string
  roomId: string
  limit?: number
  skip?: number
}

export async function fetchRoomMessagesOrThrow({
  token,
  roomId,
  limit = 250,
  skip = 0,
}: FetchRoomMessagesParams) {
  const response = await apiFetch(
    `${API_URL}/messages/room?roomId=${encodeURIComponent(roomId)}&limit=${limit}&skip=${skip}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  )

  if (!response.ok) {
    throw new Error(`Не удалось загрузить историю комнаты (${response.status})`)
  }

  const text = await response.text()
  const trimmed = text.trim()
  if (!trimmed) {
    return []
  }

  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : []
  } catch {
    throw new Error("История комнаты пришла в неверном формате")
  }
}
