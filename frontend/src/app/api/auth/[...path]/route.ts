/**
 * Same-origin auth proxy for Safari PWA compatibility.
 *
 * Safari PWA blocks third-party (cross-site) cookies, so the HttpOnly
 * `refreshToken` cookie set by the NestJS backend on Render is never sent
 * when the frontend calls the backend directly. This proxy runs on the same
 * origin as the frontend (Vercel), reads/writes cookies on that domain, and
 * manually forwards them to/from the backend.
 *
 * Mapped routes (frontend → backend):
 *   POST /api/auth/login           → POST /login
 *   POST /api/auth/register        → POST /register
 *   POST /api/auth/auth/refresh    → POST /auth/refresh
 *   POST /api/auth/auth/logout     → POST /auth/logout
 *   GET  /api/auth/auth/me         → GET  /auth/me
 */

import { NextRequest, NextResponse } from "next/server"

const BACKEND = (
  process.env.BACKEND_PROXY_TARGET?.trim() ||
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "http://127.0.0.1:3001"
).replace(/\/+$/, "")

const REFRESH_COOKIE = "refreshToken"

async function proxy(
  req: NextRequest,
  method: string,
  pathSegments: string[],
): Promise<NextResponse> {
  const backendPath = pathSegments.join("/")
  const backendUrl = `${BACKEND}/${backendPath}${req.nextUrl.search}`

  // Forward refresh cookie from the Vercel-domain to the backend.
  const refreshTokenValue = req.cookies.get(REFRESH_COOKIE)?.value
  const forwardedCookie = refreshTokenValue
    ? `${REFRESH_COOKIE}=${refreshTokenValue}`
    : undefined

  const reqHeaders: Record<string, string> = {}

  const contentType = req.headers.get("content-type")
  if (contentType) reqHeaders["content-type"] = contentType

  const authorization = req.headers.get("authorization")
  if (authorization) reqHeaders["authorization"] = authorization

  if (forwardedCookie) reqHeaders["cookie"] = forwardedCookie

  let body: string | undefined
  if (method !== "GET" && method !== "HEAD") {
    body = await req.text()
  }

  let backendResp: Response
  try {
    backendResp = await fetch(backendUrl, {
      method,
      headers: reqHeaders,
      body,
    })
  } catch {
    return NextResponse.json({ message: "Backend unreachable" }, { status: 502 })
  }

  const respText = await backendResp.text()
  const respContentType =
    backendResp.headers.get("content-type") ?? "application/json"

  const nextResp = new NextResponse(respText, {
    status: backendResp.status,
    headers: { "content-type": respContentType },
  })

  // Re-issue the refresh cookie on the Vercel (same-origin) domain so the
  // browser stores it correctly and will send it on the next same-origin request.
  const setCookieRaw = backendResp.headers.get("set-cookie")
  if (setCookieRaw) {
    // Detect cookie deletion (Max-Age=0 or empty value)
    const isEmpty =
      setCookieRaw.includes("Max-Age=0") ||
      setCookieRaw.includes("max-age=0") ||
      /refreshToken=;/.test(setCookieRaw)

    if (isEmpty) {
      nextResp.cookies.delete(REFRESH_COOKIE)
    } else {
      const tokenMatch = setCookieRaw.match(/refreshToken=([^;]+)/)
      const maxAgeMatch = setCookieRaw.match(/[Mm]ax-[Aa]ge=(\d+)/)
      if (tokenMatch) {
        nextResp.cookies.set({
          name: REFRESH_COOKIE,
          value: tokenMatch[1],
          httpOnly: true,
          secure: process.env.NODE_ENV !== "development",
          sameSite: "lax",
          path: "/",
          maxAge: maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 30 * 24 * 60 * 60,
        })
      }
    }
  }

  return nextResp
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  return proxy(req, "GET", path)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  return proxy(req, "POST", path)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  return proxy(req, "PUT", path)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  return proxy(req, "DELETE", path)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params
  return proxy(req, "PATCH", path)
}
