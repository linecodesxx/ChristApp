import { fetchNestWithAcceptLanguage } from "@/lib/server/fetchNestWithAcceptLanguage"

/**
 * Серверний приклад: запит до Nest через `/api/nest` із заголовком Accept-Language з поточної локалі.
 * Результат не відображається — лише демонстрація інтеграції для серверних компонентів.
 */
export default async function NestLocaleHandshake() {
  try {
    await fetchNestWithAcceptLanguage("/health")
  } catch {
    // Не блокуємо сторінку входу при недоступному API
  }
  return null
}
