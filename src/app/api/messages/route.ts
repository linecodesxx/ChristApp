import { NextResponse } from "next/server";
import { addMessage, getMessages } from "@/lib/storage";

export async function GET() {
  return NextResponse.json({ messages: getMessages() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string; author?: string };

  if (!body.text || !body.text.trim()) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  const message = addMessage(body.text.trim(), body.author ?? "Аноним");
  return NextResponse.json({ message }, { status: 201 });
}