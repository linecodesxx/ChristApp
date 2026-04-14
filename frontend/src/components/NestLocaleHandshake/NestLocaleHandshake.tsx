import { fetchNestWithAcceptLanguage } from "@/lib/server/fetchNestWithAcceptLanguage"

/**
 * Серверний приклад: handshake з Nest із `Accept-Language` поточної локалі.
 * Йде напряму на Nest (не через `/api/nest`), щоб при вимкненому бекенді Next dev не сипав «Failed to proxy».
 */
export default async function NestLocaleHandshake() {
  try {
    await fetchNestWithAcceptLanguage("/health", undefined, { directToNest: true })
  } catch {
    // Не блокуємо сторінку входу при недоступному API
  }
  return null
}
