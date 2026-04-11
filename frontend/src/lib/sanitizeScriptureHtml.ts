import DOMPurify from "isomorphic-dompurify"

/** Inline markup occasionally returned by Bible APIs (emphasis, small caps, etc.). */
const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ["i", "em", "b", "strong", "sup", "sub", "small", "br", "span"],
  ALLOWED_ATTR: ["class"],
}

/**
 * Strips scripts/event handlers and limits tags to safe inline formatting.
 * Returns an empty string if input is unusable or sanitization fails.
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
 * Plain text for clipboard, splash typing, or previews — strips inline HTML from API strings.
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
