import { getRequestConfig } from "next-intl/server"
import { routing } from "./routing"

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const lang = routing.langs.includes(requested as (typeof routing.langs)[number])
    ? requested
    : routing.defaultLang

  return {
    locale: lang,
    messages: (await import(`../../messages/${lang}.json`)).default,
  }
})
