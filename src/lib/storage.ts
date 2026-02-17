import { readFile } from "node:fs/promises";
import path from "node:path";
import type { BibleData } from "@/types/bible";
import type { Message } from "@/types/message";

let messages: Message[] = [
  {
    id: "welcome",
    author: "Система",
    text: "Добро пожаловать в общий чат.",
    createdAt: new Date().toISOString(),
  },
];

export function getMessages(): Message[] {
  return messages;
}

export function addMessage(text: string, author: string): Message {
  const message: Message = {
    id: crypto.randomUUID(),
    author,
    text,
    createdAt: new Date().toISOString(),
  };

  messages = [...messages, message];
  return message;
}

export async function getBibleData(): Promise<BibleData> {
  const jsonPath = path.join(process.cwd(), "public", "bible.json");
  const content = await readFile(jsonPath, "utf-8");
  return JSON.parse(content) as BibleData;
}