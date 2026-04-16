import { redirect } from "next/navigation"

type Props = {
  params: Promise<{ lang: string }>
}

/**
 * Зовнішній /app/catch → список чатів.
 */
export default async function CatchRedirectPage({ params }: Props) {
  const { lang } = await params
  redirect(`/${lang}/chat`)
}
