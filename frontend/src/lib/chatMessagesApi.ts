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

  return (await response.json()) as Array<Record<string, unknown>>
}
