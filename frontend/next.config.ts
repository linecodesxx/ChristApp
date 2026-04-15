import os from "node:os"
import path from "node:path"
import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

function isPrivateLanIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) {
    return false
  }
  const oct = [1, 2, 3, 4].map((i) => Number(m[i]))
  if (oct.some((n) => !Number.isInteger(n) || n > 255)) {
    return false
  }
  const [a, b] = oct
  if (a === 10) {
    return true
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true
  }
  if (a === 192 && b === 168) {
    return true
  }
  return false
}

/** Hostnames для allowedDevOrigins (без порта). Убирает предупреждение Next про cross-origin /_next/* при заходе с LAN IP. */
function computeAllowedDevOrigins(): string[] | undefined {
  const out = new Set<string>()

  const fromEnvList = process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []
  for (const item of fromEnvList) {
    if (/^https?:\/\//i.test(item)) {
      try {
        out.add(new URL(item).hostname)
      } catch {
        /* ignore */
      }
    } else if (item) {
      out.add(item)
    }
  }

  for (const key of ["NEXT_PUBLIC_APP_URL", "NEXT_INTERNAL_APP_ORIGIN"] as const) {
    const raw = process.env[key]?.trim()
    if (raw && /^https?:\/\//i.test(raw)) {
      try {
        out.add(new URL(raw).hostname)
      } catch {
        /* ignore */
      }
    }
  }

  if (process.env.NODE_ENV !== "production") {
    for (const infos of Object.values(os.networkInterfaces())) {
      if (!infos) {
        continue
      }
      for (const info of infos) {
        if (info.internal || info.family !== "IPv4") {
          continue
        }
        if (isPrivateLanIPv4(info.address)) {
          out.add(info.address)
        }
      }
    }
  }

  if (out.size === 0) {
    return undefined
  }
  return Array.from(out)
}

/** Разрешённые источники для next/image: локальные `/uploads/...` и аватары с Cloudinary (`avatarUrl` = `https://res.cloudinary.com/...`). */
function uploadsRemotePatterns(): NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> {
  const patterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> = [
    { protocol: "http", hostname: "localhost", port: "3001", pathname: "/uploads/**" },
    { protocol: "http", hostname: "127.0.0.1", port: "3001", pathname: "/uploads/**" },
    { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
  ]

  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || process.env.BACKEND_PROXY_TARGET?.trim()
  if (!apiUrl) {
    return patterns
  }

  try {
    const parsed = new URL(apiUrl)
    const protocol = parsed.protocol === "https:" ? "https" : "http"
    const entry: (typeof patterns)[number] = {
      protocol,
      hostname: parsed.hostname,
      pathname: "/uploads/**",
    }
    if (parsed.port) {
      entry.port = parsed.port
    }

    const duplicate = patterns.some(
      (existing) =>
        existing.hostname === entry.hostname && (existing.port ?? "") === (entry.port ?? ""),
    )
    if (!duplicate) {
      patterns.push(entry)
    }
  } catch {
    // невалидный NEXT_PUBLIC_API_URL — остаются только localhost
  }

  return patterns
}

/** Origins для CSP сервис-воркера (`connect-src`): fetch к API и статике аватаров. */
function serviceWorkerConnectSrc(): string {
  const parts = new Set<string>([
    "'self'",
    "https://api.prayerpulse.io",
    "https://res.cloudinary.com",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ])

  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || process.env.BACKEND_PROXY_TARGET?.trim()
  if (apiUrl) {
    try {
      const parsed = new URL(apiUrl)
      parts.add(`${parsed.protocol}//${parsed.host}`)
    } catch {
      // ignore invalid URL
    }
  }

  return Array.from(parts).join(" ")
}

const allowedDevOrigins = computeAllowedDevOrigins()
const workspaceRoot = path.resolve(__dirname, "..")

const nextConfig: NextConfig = {
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
  },
  ...(allowedDevOrigins ? { allowedDevOrigins } : {}),
  /** HTTP к Nest без CORS: браузер бьёт в тот же origin, Next проксирует на бэкенд. */
  async rewrites() {
    const target = (process.env.BACKEND_PROXY_TARGET?.trim() || "http://127.0.0.1:3001").replace(/\/+$/, "")
    return [
      {
        source: "/api/nest/:path*",
        destination: `${target}/:path*`,
      },
    ]
  },
  images: {
    remotePatterns: uploadsRemotePatterns(),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self'",
              `connect-src ${serviceWorkerConnectSrc()}`,
            ].join("; "),
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig)
