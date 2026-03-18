import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    const pathParam = req.nextUrl.pathname.replace("/api/bibleProxy", "");
    const apiUrl = `${process.env.NEXT_PUBLIC_BIBLE_API_URL}${pathParam}${url.search}`;

    const apiRes = await fetch(apiUrl);

    const text = await apiRes.text();
    console.log("RESPONSE:", text.slice(0, 300));

    if (!apiRes.ok) {
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
    return NextResponse.json(
      { error: "Proxy failed", details: (err as any).message },
      { status: 500 },
    );
  }
}
