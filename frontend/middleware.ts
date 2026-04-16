import { routing } from "@/i18n/routing"
import createMiddleware from "next-intl/middleware"
import { NextRequest } from "next/server"

const intlMiddleware = createMiddleware(routing)

const langs = routing.langs

function pathnameWithoutLang(pathname: string): string | null {
  for (const loc of langs) {
    if (pathname === `/${loc}`) {
      return "/"
    }
    if (pathname.startsWith(`/${loc}/`)) {
      const rest = pathname.slice(`/${loc}`.length)
      return rest.length > 0 ? rest : "/"
    }
  }
  return null
}

export default function middleware(request: NextRequest) {
  const response = intlMiddleware(request)

  if (response.headers.get("location")) {
    return response
  }

  const stripped = pathnameWithoutLang(request.nextUrl.pathname)
  if (stripped === null) {
    return response
  }

  return response
}

export const config = {
  // Важно: отдельный `'/'` — иначе шаблон с группой часто не матчит корень, middleware не бежит и `/` даёт 404.
  matcher: [
    "/",
    "/(en|ru|ua)/:path*",
    "/((?!api|_next|.*\\..*|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest).*)",
  ],
}
