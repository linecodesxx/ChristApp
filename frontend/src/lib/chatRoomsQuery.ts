export function chatMyRoomsQueryKey(userId: string | null | undefined) {
  return ["chat", "my-rooms", userId ?? "anonymous"] as const
}
