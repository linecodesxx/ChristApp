import axios from "axios";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const pathParam = req.nextUrl.pathname.replace("/api/bibleProxy", "");
    const upstreamBase = (
      process.env.NEXT_PUBLIC_BIBLE_API_URL || "https://api.prayerpulse.io"
    ).replace(/\/$/, "");
    const apiUrl = `${upstreamBase}${pathParam}${url.search}`;

    const apiRes = await axios.get<string>(apiUrl, {
      responseType: "text",
      validateStatus: () => true,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: "https://christ-app-nine.vercel.app",
        Origin: "https://christ-app-nine.vercel.app",
      },
      timeout: 60_000,
    });

    const text = apiRes.data;

    if (apiRes.status < 200 || apiRes.status >= 300) {
      console.error("UPSTREAM ERROR:", apiRes.status, text);

      return NextResponse.json(
        {
          error: "Upstream error",
          status: apiRes.status,
          raw: text.slice(0, 300),
        },
        { status: apiRes.status },
      );
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      console.error("NOT JSON:", text);

      return NextResponse.json(
        {
          error: "Invalid JSON from API",
          raw: text.slice(0, 300),
        },
        { status: 500 },
      );
    }

    return NextResponse.json(data, {
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    const details = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Proxy failed", details },
      { status: 500 },
    );
  }
}
