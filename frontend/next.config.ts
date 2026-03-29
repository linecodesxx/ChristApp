import type { NextConfig } from "next"

/** Разрешённые источники для next/image (аватары с бэкенда `/uploads/...`). */
function uploadsRemotePatterns(): NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> {
  const patterns: NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]> = [
    { protocol: "http", hostname: "localhost", port: "3001", pathname: "/uploads/**" },
    { protocol: "http", hostname: "127.0.0.1", port: "3001", pathname: "/uploads/**" },
  ]

  const apiUrl = process.env.NEXT_PUBLIC_API_URL
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
  const parts = new Set<string>(["'self'", "https://api.prayerpulse.io", "http://localhost:3001", "http://127.0.0.1:3001"])

  const apiUrl = process.env.NEXT_PUBLIC_API_URL
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

const nextConfig: NextConfig = {
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

export default nextConfig;
