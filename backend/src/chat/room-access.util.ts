/** Префикс комнаты «Поделись с Иисусом» (title = share-with-jesus:{ownerUserId}). */
export const SHARE_WITH_JESUS_ROOM_PREFIX = 'share-with-jesus:';

/**
 * Доступ к комнате по title: для dm: и share-with-jesus: — только «законные» userId.
 * Остальные комнаты: достаточно membership (проверяется отдельно).
 */
export function userMayAccessRoomByTitle(userId: string, title: string): boolean {
  if (title.startsWith('dm:')) {
    const parts = title.split(':');
    if (parts.length !== 3 || parts[0] !== 'dm') {
      return false;
    }
    const [, idA, idB] = parts;
    return userId === idA || userId === idB;
  }

  if (title.startsWith(SHARE_WITH_JESUS_ROOM_PREFIX)) {
    const ownerId = title.slice(SHARE_WITH_JESUS_ROOM_PREFIX.length);
    return userId === ownerId;
  }

  return true;
}
