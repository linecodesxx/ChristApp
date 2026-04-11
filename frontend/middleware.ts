import { AUTH_COOKIE_NAME, isAuthenticated } from "@/lib/auth"
import { routing } from "@/i18n/routing"
import createMiddleware from "next-intl/middleware"
import { NextRequest, NextResponse } from "next/server"

const intlMiddleware = createMiddleware(routing)

const locales = routing.locales

function pathnameWithoutLocale(pathname: string): string | null {
  for (const loc of locales) {
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

  const stripped = pathnameWithoutLocale(request.nextUrl.pathname)
  if (stripped === null) {
    return response
  }

  const publicRoutes = ["/", "/register", "/offline"]
  const isPublic = publicRoutes.some(
    (route) => stripped === route || stripped.startsWith(`${route}/`),
  )

  if (isPublic) {
    return response
  }

  const cookieValue = request.cookies.get(AUTH_COOKIE_NAME)?.value
  if (!isAuthenticated(cookieValue)) {
    const seg = request.nextUrl.pathname.split("/")[1]
    const safeLocale = locales.includes(seg as (typeof locales)[number]) ? seg : routing.defaultLocale
    return NextResponse.redirect(new URL(`/${safeLocale}`, request.url))
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
