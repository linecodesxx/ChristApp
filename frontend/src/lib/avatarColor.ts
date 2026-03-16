const AVATAR_COLORS = [
  "#8B9E7E", "#7EA18F", "#9A8BB5", "#7C97C4", "#B08A7E", "#7FA8A8", "#9B8F77", "#8C8FAE"
]

export function getAvatarColor(seed: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(index)
    hash |= 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export { AVATAR_COLORS }
