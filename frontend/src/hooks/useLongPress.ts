"use client"

import { useCallback, useEffect, useRef, type MouseEventHandler, type TouchEventHandler } from "react"

type UseLongPressOptions = {
  ms?: number
  moveThreshold?: number
}

type LongPressHandlers<T extends HTMLElement> = {
  onMouseDown: MouseEventHandler<T>
  onMouseUp: MouseEventHandler<T>
  onMouseLeave: MouseEventHandler<T>
  onTouchStart: TouchEventHandler<T>
  onTouchMove: TouchEventHandler<T>
  onTouchEnd: TouchEventHandler<T>
  onTouchCancel: TouchEventHandler<T>
}

export function useLongPress<T extends HTMLElement>(
  callback: () => void,
  options: UseLongPressOptions = {},
): LongPressHandlers<T> {
  const { ms = 500, moveThreshold = 12 } = options
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    clear()
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      callback()
    }, ms)
  }, [callback, clear, ms])

  const stopTouch = useCallback(() => {
    touchStartRef.current = null
    clear()
  }, [clear])

  const handleTouchStart = useCallback<TouchEventHandler<T>>(
    (event) => {
      const touch = event.touches[0]
      if (!touch) return

      touchStartRef.current = { x: touch.clientX, y: touch.clientY }
      start()
    },
    [start],
  )

  const handleTouchMove = useCallback<TouchEventHandler<T>>(
    (event) => {
      const touch = event.touches[0]
      const startPoint = touchStartRef.current
      if (!touch || !startPoint) return

      if (
        Math.abs(touch.clientX - startPoint.x) > moveThreshold ||
        Math.abs(touch.clientY - startPoint.y) > moveThreshold
      ) {
        stopTouch()
      }
    },
    [moveThreshold, stopTouch],
  )

  useEffect(() => clear, [clear])

  return {
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear,
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: stopTouch,
    onTouchCancel: stopTouch,
  }
}