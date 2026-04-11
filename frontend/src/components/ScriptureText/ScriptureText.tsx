import type { ElementType, HTMLAttributes } from "react"
import { sanitizeScriptureHtml } from "@/lib/sanitizeScriptureHtml"
import styles from "./ScriptureText.module.scss"

export type ScriptureTextProps = {
  /** Raw HTML string from the Bible API (e.g. contains <i> for emphasis). */
  html: string
  className?: string
  /** Root element; default `p` for block quotes. */
  as?: ElementType
} & Omit<HTMLAttributes<HTMLElement>, "dangerouslySetInnerHTML" | "children">

/**
 * Renders scripture HTML safely (sanitized) with Quiet Luxury styling for emphasis.
 *
 * Example input: `"Blessed <i>are</i> the pure in heart, For they shall see God."`
 */
export function ScriptureText({ html, className, as: Component = "p", ...rest }: ScriptureTextProps) {
  const safeHtml = sanitizeScriptureHtml(html)

  const mergedClass = [styles.root, className].filter(Boolean).join(" ")

  if (!safeHtml) {
    return (
      <Component
        {...rest}
        className={`${mergedClass} ${styles.empty}`}
        aria-label="Scripture text unavailable"
      >
        —
      </Component>
    )
  }

  return (
    <Component {...rest} className={mergedClass} dangerouslySetInnerHTML={{ __html: safeHtml }} />
  )
}
