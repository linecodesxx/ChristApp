import type { ElementType, HTMLAttributes } from "react"
import { sanitizeScriptureHtml } from "@/lib/sanitizeScriptureHtml"
import styles from "./ScriptureText.module.scss"

export type ScriptureTextProps = {
  /** Сирий HTML-рядок з Bible API (наприклад, містить <i> для акценту). */
  html: string | undefined | null
  className?: string
  /** Кореневий елемент; за замовчуванням `p` для блочних цитат. */
  as?: ElementType
} & Omit<HTMLAttributes<HTMLElement>, "dangerouslySetInnerHTML" | "children">

/**
 * Безпечно рендерить scripture HTML (після санітизації) зі стилізацією Quiet Luxury для акцентів.
 *
 * Приклад вхідних даних: `"Blessed <i>are</i> the pure in heart, For they shall see God."`
 */
export function ScriptureText({ html, className, as: Component = "p", ...rest }: ScriptureTextProps) {
  const safeHtml = sanitizeScriptureHtml(typeof html === "string" ? html : "")

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
