"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

type TabBarOverlayContextValue = {
  chatComposerFocused: boolean
  setChatComposerFocused: (focused: boolean) => void
}

const TabBarOverlayContext = createContext<TabBarOverlayContextValue | null>(null)

export function TabBarOverlayProvider({ children }: { children: ReactNode }) {
  const [chatComposerFocused, setChatComposerFocusedState] = useState(false)
  const setChatComposerFocused = useCallback((focused: boolean) => {
    setChatComposerFocusedState(focused)
  }, [])
  const value = useMemo(
    () => ({ chatComposerFocused, setChatComposerFocused }),
    [chatComposerFocused, setChatComposerFocused],
  )
  return <TabBarOverlayContext.Provider value={value}>{children}</TabBarOverlayContext.Provider>
}

export function useTabBarOverlay() {
  const ctx = useContext(TabBarOverlayContext)
  if (!ctx) {
    throw new Error("useTabBarOverlay must be used within TabBarOverlayProvider")
  }
  return ctx
}

/** Для TabBar і розмітки поза обов'язковим провайдером (наприклад, тести). */
export function useTabBarOverlayOptional(): TabBarOverlayContextValue | null {
  return useContext(TabBarOverlayContext)
}
