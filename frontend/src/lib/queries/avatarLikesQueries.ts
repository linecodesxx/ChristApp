import { apiFetch } from "@/lib/apiFetch"
import { getAuthToken } from "@/lib/auth"
import { getHttpApiBase } from "@/lib/apiBase"

export type AvatarLikesMeResponse = {
  receivedCount: number
}

export type AvatarLikesUserResponse = {
  receivedCount: number
  likedByMe: boolean
}

export const avatarLikesMeQueryKey = ["users", "me", "avatar-likes"] as const

export const avatarLikesForUserQueryKey = (userId: string) =>
  ["users", userId, "avatar-likes"] as const

export async function fetchMyAvatarLikesReceived(): Promise<AvatarLikesMeResponse> {
  const token = getAuthToken()
  if (!token) {
    return { receivedCount: 0 }
  }
  const res = await apiFetch(`${getHttpApiBase()}/users/me/avatar-likes`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    return { receivedCount: 0 }
  }
  return (await res.json()) as AvatarLikesMeResponse
}

export async function fetchAvatarLikesForUser(userId: string): Promise<AvatarLikesUserResponse> {
  const token = getAuthToken()
  if (!token || !userId) {
    return { receivedCount: 0, likedByMe: false }
  }
  const res = await apiFetch(`${getHttpApiBase()}/users/${userId}/avatar-likes`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    return { receivedCount: 0, likedByMe: false }
  }
  return (await res.json()) as AvatarLikesUserResponse
}

export async function toggleAvatarLikeForUser(userId: string): Promise<AvatarLikesUserResponse> {
  const token = getAuthToken()
  if (!token) {
    throw new Error("no auth")
  }
  const res = await apiFetch(`${getHttpApiBase()}/users/${userId}/avatar-likes/toggle`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(typeof err?.message === "string" ? err.message : "toggle failed")
  }
  return (await res.json()) as AvatarLikesUserResponse
}
