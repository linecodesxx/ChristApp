import { routing } from "@/i18n/routing"
import { redirect } from "next/navigation"

/** Резерв, если запрос к `/` не попал в middleware (редкий кейс с matcher). */
export default function RootPage() {
  redirect(`/${routing.defaultLocale}`)
}
