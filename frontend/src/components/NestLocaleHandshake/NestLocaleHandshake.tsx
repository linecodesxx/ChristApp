import { fetchNestWithAcceptLanguage } from "@/lib/server/fetchNestWithAcceptLanguage"

/**
 * Серверный пример: запрос к Nest через `/api/nest` с заголовком Accept-Language из текущей локали.
 * Результат не отображается — только демонстрация интеграции для серверных компонентов.
 */
export default async function NestLocaleHandshake() {
  try {
    await fetchNestWithAcceptLanguage("/health")
  } catch {
    // Не блокируем страницу входа при недоступном API
  }
  return null
}
