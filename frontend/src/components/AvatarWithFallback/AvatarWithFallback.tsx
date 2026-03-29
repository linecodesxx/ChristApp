"use client"

import { useCallback, useEffect, useState } from "react"
import { getAvatarColor } from "@/lib/avatarColor"

type FallbackTag = "div" | "span"

type FallbackTint = "always" | "onError"

type AvatarWithFallbackProps = {
  src?: string | null
  initials: string
  /** Стабильный seed для цвета (id пользователя и т.п.). */
  colorSeed: string
  width: number
  height: number
  imageClassName?: string
  fallbackClassName: string
  fallbackTag?: FallbackTag
  alt?: string
  loading?: "eager" | "lazy"
  /**
   * `always` — фон инициалов из seed всегда (в т.ч. когда src нет).
   * `onError` — цвет из seed только после ошибки загрузки картинки (404 и т.д.); если src нет — только стили класса.
   */
  fallbackTint?: FallbackTint
}

/**
 * Показывает фото; при 404/ошибке загрузки — инициалы на фоне цвета из seed (как getAvatarColor).
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
  const [broken, setBroken] = useState(false)
  const trimmed = src?.trim() ?? ""
  const showImage = Boolean(trimmed) && !broken

  useEffect(() => {
    setBroken(false)
  }, [trimmed])

  const onError = useCallback(() => {
    setBroken(true)
  }, [])

  const useSeedBackground = fallbackTint === "always" || (fallbackTint === "onError" && broken)
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
