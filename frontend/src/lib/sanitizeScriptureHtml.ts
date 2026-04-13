import DOMPurify from "isomorphic-dompurify"

/** Inline-розмітка, яку інколи повертають Bible API (акценти, small caps тощо). */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ["i", "em", "b", "strong", "sup", "sub", "small", "br", "span"],
  ALLOWED_ATTR: ["class"],
}

/**
 * Видаляє scripts/event handlers і обмежує теги до безпечного inline-форматування.
 * Повертає порожній рядок, якщо вхідні дані непридатні або санітизація не вдалась.
 */
export function sanitizeScriptureHtml(dirty: unknown): string {
  if (typeof dirty !== "string") {
    return ""
  }
  const trimmed = dirty.trim()
  if (!trimmed) {
    return ""
  }
  try {
    return DOMPurify.sanitize(trimmed, SANITIZE_CONFIG)
  } catch {
    return ""
  }
}

/**
 * Plain text для буфера обміну, splash typing або прев'ю — прибирає inline HTML з API-рядків.
 */
export function scripturePlainText(raw: unknown): string {
  if (typeof raw !== "string") {
    return ""
  }
  try {
    return raw
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  } catch {
    return ""
  }
}
