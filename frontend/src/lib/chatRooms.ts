import { getInitials } from "@/lib/utils"
import { resolvePublicAvatarUrl } from "@/lib/avatarUrl"
import type { ChatListItem } from "@/components/ChatList/ChatList"

export const GLOBAL_ROOM_ID = "00000000-0000-0000-0000-000000000001"
export const GLOBAL_ROOM_SLUG = "global"
export const GLOBAL_CHAT_TITLE = "Общий чат для всех"
export const GLOBAL_CHAT_AVATAR_SRC = "/ava-chat.jpeg"
export const SHARE_WITH_JESUS_ROOM_PREFIX = "share-with-jesus:"
export const SHARE_WITH_JESUS_CHAT_ID = "__share_with_jesus__"
export const SHARE_WITH_JESUS_CHAT_TITLE = "Поделись с Иисусом"
export const SHARE_WITH_JESUS_SLUG = "share-with-jesus"

export type RoomSocketItem = {
  id: string
  title: string
  createdAt?: string
}

export type ShareTarget = {
  id: string
  roomId: string
  title: string
  avatarInitials?: string
  avatarImage?: string
  avatarClass?: string
  isOnline?: boolean
}

export function isShareWithJesusRoomTitle(title: string) {
  return title.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)
}

export function getDirectTargetUserId(roomTitle: string, currentUserId?: string) {
  if (!roomTitle?.startsWith("dm:")) return undefined
  const ids = roomTitle.split(":").slice(1)
  return ids.find((id) => id !== currentUserId)
}

export function createGlobalChatItem(overrides?: Partial<ChatListItem>): ChatListItem {
  return {
    id: GLOBAL_ROOM_ID,
    title: GLOBAL_CHAT_TITLE,
    avatarInitials: getInitials(GLOBAL_CHAT_TITLE),
    avatarImage: GLOBAL_CHAT_AVATAR_SRC,
    href: `/chat/${GLOBAL_ROOM_SLUG}`,
    preview: "",
    timeLabel: "",
    unread: 0,
    ...overrides,
  }
}

export function createShareTargetsFromRooms(input: {
  rooms: RoomSocketItem[]
  currentUserId?: string
  users: Array<{
    id: string
    username: string
    nickname?: string
    avatarUrl?: string | null
  }>
  onlineUserIds?: Set<string>
}): ShareTarget[] {
  const { rooms, currentUserId, users, onlineUserIds = new Set() } = input
  const usersById = new Map(users.map((u) => [u.id, u]))
  const targets: ShareTarget[] = []

  for (const room of rooms) {
    if (room.id === GLOBAL_ROOM_ID) {
      targets.push({
        id: GLOBAL_ROOM_ID,
        roomId: GLOBAL_ROOM_ID,
        title: GLOBAL_CHAT_TITLE,
        avatarImage: GLOBAL_CHAT_AVATAR_SRC,
      })
      continue
    }

    if (isShareWithJesusRoomTitle(room.title)) {
      targets.push({
        id: SHARE_WITH_JESUS_CHAT_ID,
        roomId: room.id,
        title: SHARE_WITH_JESUS_CHAT_TITLE,
        avatarImage: "/jesus-say.svg",
        avatarClass: "jesusAvatar",
      })
      continue
    }

    const targetUserId = getDirectTargetUserId(room.title, currentUserId)
    if (!targetUserId) {
      continue
    }

    const matchedUser = usersById.get(targetUserId)
    const title = matchedUser?.nickname ?? matchedUser?.username ?? "Личный чат"
    targets.push({
      id: targetUserId,
      roomId: room.id,
      title,
      avatarInitials: getInitials(title),
      avatarImage: resolvePublicAvatarUrl(matchedUser?.avatarUrl),
      isOnline: onlineUserIds.has(targetUserId),
    })
  }

  /** Глобальный чат не всегда приходит в `getMyRooms`, но шарить стихи туда нужно всегда. */
  const hasGlobal = targets.some((t) => t.id === GLOBAL_ROOM_ID)
  if (!hasGlobal) {
    targets.push({
      id: GLOBAL_ROOM_ID,
      roomId: GLOBAL_ROOM_ID,
      title: GLOBAL_CHAT_TITLE,
      avatarImage: GLOBAL_CHAT_AVATAR_SRC,
    })
  }

  return targets.sort((a, b) => {
    if (a.id === SHARE_WITH_JESUS_CHAT_ID) return -1
    if (b.id === SHARE_WITH_JESUS_CHAT_ID) return 1
    if (a.id === GLOBAL_ROOM_ID) return -1
    if (b.id === GLOBAL_ROOM_ID) return 1
    return a.title.localeCompare(b.title, "ru", { sensitivity: "base" })
  })
}
