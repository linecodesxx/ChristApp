"use client"

import { useCallback, useState } from "react"
import { getAvatarColor } from "@/lib/avatarColor"

type FallbackTag = "div" | "span"

type FallbackTint = "always" | "onError"

type AvatarWithFallbackProps = {
  src?: string | null
  initials: string
  /** Стабільний seed для кольору (id користувача тощо). */
  colorSeed: string
  width: number
  height: number
  imageClassName?: string
  fallbackClassName: string
  fallbackTag?: FallbackTag
  alt?: string
  loading?: "eager" | "lazy"
  /**
  * `always` — фон ініціалів із seed завжди (зокрема коли src немає).
  * `onError` — колір із seed лише після помилки завантаження зображення (404 тощо); якщо src немає — лише стилі класу.
   */
  fallbackTint?: FallbackTint
}

/**
 * Показує фото; при 404/помилці завантаження — ініціали на тлі кольору із seed (як getAvatarColor).
 */
export default function AvatarWithFallback({
  src,
  initials,
  colorSeed,
  width,
  height,
  imageClassName,
  fallbackClassName,
  fallbackTag = "div",
  alt = "",
  loading = "lazy",
  fallbackTint = "always",
}: AvatarWithFallbackProps) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null)
  const trimmed = src?.trim() ?? ""
  const showImage = Boolean(trimmed) && brokenSrc !== trimmed

  const onError = useCallback(() => {
    setBrokenSrc(trimmed)
  }, [trimmed])

  const useSeedBackground = fallbackTint === "always" || (fallbackTint === "onError" && brokenSrc === trimmed)
  const bg = useSeedBackground ? getAvatarColor(colorSeed || initials || "?") : undefined

  if (!showImage) {
    const Fallback = fallbackTag
    return (
      <Fallback
        className={fallbackClassName}
        style={bg ? { backgroundColor: bg } : undefined}
        aria-hidden={!alt}
      >
        {initials}
      </Fallback>
    )
  }

  return (
    <img
      src={trimmed}
      alt={alt}
      width={width}
      height={height}
      className={imageClassName}
      onError={onError}
      loading={loading}
      decoding="async"
    />
  )
}
