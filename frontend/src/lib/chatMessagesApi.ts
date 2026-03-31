const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/+$/, "")

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
  const response = await fetch(
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
