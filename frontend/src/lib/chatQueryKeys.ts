export function chatRoomHistoryQueryKey(roomId: string | null | undefined) {
  return ["chat", "room-history", roomId ?? "none"] as const
}
