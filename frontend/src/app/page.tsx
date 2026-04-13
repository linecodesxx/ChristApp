import { routing } from "@/i18n/routing"
import { redirect } from "next/navigation"

/** Резерв, якщо запит до `/` не потрапив у middleware (рідкісний кейс із matcher). */
export default function RootPage() {
  redirect(`/${routing.defaultLocale}`)
}
