import { defineRouting } from "next-intl/routing"

export const routing = defineRouting({
  locales: ["en", "ru", "ua"],
  defaultLocale: "en",
  localePrefix: "always",
})
