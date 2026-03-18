import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // Берём динамический путь
    const pathParam = req.nextUrl.pathname.replace("/api/bibleProxy", "");
    const apiUrl = `${process.env.NEXT_PUBLIC_BIBLE_API_URL}${pathParam}${url.search}`;

    const apiRes = await fetch(apiUrl);
    const data = await apiRes.json();

    return NextResponse.json(data, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Proxy failed", details: (err as any).message },
      { status: 500 },
    );
  }
}