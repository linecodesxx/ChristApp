/** Дефолтный UUID общей комнаты (должен совпадать с сидом в БД). */
export const DEFAULT_GLOBAL_ROOM_ID = '00000000-0000-0000-0000-000000000001';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * `process.env.GLOBAL_ROOM_ID ?? default` ломается, если в .env задана пустая строка
 * (часто на Render/CI) — в SQL уходит "" и PostgreSQL отвечает invalid uuid → 500.
 */
export function resolveGlobalRoomId(): string {
  const raw = process.env.GLOBAL_ROOM_ID?.trim();
  if (!raw) {
    return DEFAULT_GLOBAL_ROOM_ID;
  }
  if (!UUID_RE.test(raw)) {
    console.warn(
      '[global-room] GLOBAL_ROOM_ID is not a valid UUID, using default room id',
    );
    return DEFAULT_GLOBAL_ROOM_ID;
  }
  return raw;
}
