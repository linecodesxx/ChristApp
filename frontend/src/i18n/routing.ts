import { defineRouting } from "next-intl/routing"

const baseRouting = defineRouting({
  locales: ["en", "ru", "ua"],
  defaultLocale: "en",
  localePrefix: "always",
})

export const routing = {
  ...baseRouting,
  langs: baseRouting.locales,
  defaultLang: baseRouting.defaultLocale,
  langPrefix: baseRouting.localePrefix,
}
