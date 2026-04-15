export function toAgoraUid(userId: string): number {
  const source = userId.trim();
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  // Agora uid must be a positive integer within uint32 range.
  return (hash >>> 0) || 1;
}
