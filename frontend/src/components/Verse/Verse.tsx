"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import styles from "./Verse.module.scss"
import { saveVerse } from "@/lib/versesApi"
import Image from "next/image"

const selectedVersesClipboardStore = new Map<string, string>()
const VERSE_HIGHLIGHT_STORAGE_KEY = "verse-highlight-colors"
const colors = ["#e92441", "#C4A265", "#64B5F6", "#81C784", "#BA68C8"]

type VerseProps = {
  verse: number
  text: string
  bookName?: string
  chapter?: number
  translation?: string
  onBookClick?: () => void
  onChapterClick?: () => void
  /** called when verse is clicked (in addition to internal highlighting) */
  onVerseClick?: (verse: number) => void
  /** external selection state (e.g. last read verse) */
  selected?: boolean
  /** optional id attribute (used for scrolling) */
  id?: string
  /** show Save/Share actions near selected verse */
  showInlineActions?: boolean
}

export default function Verse({
  verse,
  text,
  bookName,
  chapter,
  translation = "default",
  onBookClick,
  onChapterClick,
  onVerseClick,
  selected,
  id,
  showInlineActions,
}: VerseProps) {
  const [isClicked, setIsClicked] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [isActionsVisible, setIsActionsVisible] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const verseReference = `${bookName ? `${bookName} ` : ""}${chapter ? `${chapter}:` : ""}${verse}`
  const verseLine = `${verseReference} - ${text}`
  const verseKey = `${bookName ?? ""}|${chapter ?? 0}|${verse}|${text}`
  const isSelected = typeof selected === "boolean" ? selected : isClicked

  void onBookClick
  void onChapterClick

  const syncClipboardSelection = useCallback(
    (nextSelected: boolean) => {
      if (nextSelected) {
        selectedVersesClipboardStore.set(verseKey, verseLine)
      } else {
        selectedVersesClipboardStore.delete(verseKey)
      }
    },
    [verseKey, verseLine],
  )

  useEffect(() => {
    if (typeof selected === "boolean") {
      syncClipboardSelection(selected)
    }
  }, [selected, syncClipboardSelection])

  useEffect(() => {
    return () => {
      selectedVersesClipboardStore.delete(verseKey)
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current)
      }
    }
  }, [verseKey])

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const rawValue = window.localStorage.getItem(VERSE_HIGHLIGHT_STORAGE_KEY)
      if (!rawValue) {
        setSelectedColor(null)
        return
      }

      const parsed = JSON.parse(rawValue) as Record<string, string>
      const savedColor = parsed[verseKey]
      if (savedColor && colors.includes(savedColor)) {
        setSelectedColor(savedColor)
        return
      }

      setSelectedColor(null)
    } catch {
      setSelectedColor(null)
    }
  }, [verseKey])

  const handleClick = () => {
    if (isSelected && !isActionsVisible) {
      setIsActionsVisible(true)
      syncClipboardSelection(true)
      return
    }

    const nextIsClicked = !isSelected
    if (typeof selected !== "boolean") {
      setIsClicked(nextIsClicked)
    }
    setIsActionsVisible(true)
    onVerseClick?.(verse)
    syncClipboardSelection(nextIsClicked)
  }

  const handleSave = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    if (!bookName || !chapter) {
      console.error("Missing book or chapter information")
      return
    }

    try {
      setIsSaving(true)
      await saveVerse(bookName, chapter, verse, text, translation)
      setIsSaved(true)

      // Reset saved state after 2 seconds
      setTimeout(() => {
        setIsSaved(false)
      }, 2000)
    } catch (error) {
      const catchError = error as Error & { message: string }
      console.error("Failed to save verse", catchError)
      // Check if it's already saved
      if (catchError.message.includes("already")) {
        setIsSaved(true)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleShare = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (typeof navigator === "undefined" || !navigator.share) return
    void navigator
      .share({
        title: "Мой сайт",
        text: "Посмотри эту страницу",
        url: window.location.href,
      })
      .catch(() => undefined)
  }

  const handleCopy = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return
    const selectedText = Array.from(selectedVersesClipboardStore.values()).join("\n")
    const textToCopy = selectedText || verseLine

    void navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        setIsCopied(true)
        if (copiedTimeoutRef.current) {
          clearTimeout(copiedTimeoutRef.current)
        }
        copiedTimeoutRef.current = setTimeout(() => {
          setIsCopied(false)
          copiedTimeoutRef.current = null
        }, 900)
      })
      .catch(() => undefined)
  }

  const handleHighlightColorSelect = (event: React.MouseEvent<HTMLButtonElement>, color: string) => {
    event.stopPropagation()

    const nextColor = selectedColor === color ? null : color

    setSelectedColor(nextColor)
    setIsActionsVisible(false)

    if (typeof window === "undefined") return

    try {
      const rawValue = window.localStorage.getItem(VERSE_HIGHLIGHT_STORAGE_KEY)
      const parsed = rawValue ? (JSON.parse(rawValue) as Record<string, string>) : {}

      if (nextColor) {
        parsed[verseKey] = nextColor
      } else {
        delete parsed[verseKey]
      }

      window.localStorage.setItem(VERSE_HIGHLIGHT_STORAGE_KEY, JSON.stringify(parsed))
    } catch {
      // no-op: localStorage may be unavailable
    }
  }

  const hasColorHighlight = Boolean(selectedColor)

  const selectedColorStyle = selectedColor
    ? ({
        "--selected-decoration-color": `color-mix(in srgb, ${selectedColor} 45%, transparent)`,
        "--selected-border-color": selectedColor,
        "--selected-background": `color-mix(in srgb, ${selectedColor} 20%, transparent)`,
      } as React.CSSProperties)
    : undefined

  return (
    <div className={styles.verseContainer} id={id}>
      <div className={styles.verseRow}>
        <p className={styles.verse} onClick={handleClick}>
          <sup
            style={{
              fontSize: verse === 1 ? "24px" : "12px",
              color: "#C4A265",
              verticalAlign: "super",
              marginRight: "4px",
            }}
          >
            {verse}
          </sup>
          <span
            className={`${hasColorHighlight ? styles.selected : ""} ${isCopied ? styles.copied : ""}`}
            style={selectedColorStyle}
          >
            {text}
          </span>
        </p>

        {showInlineActions && isSelected && isActionsVisible ? (
          <div className={styles.inlineActions}>
            <button
              type="button"
              className={`${styles.inlineActionButton} ${isSaved ? styles.saved : ""}`}
              onClick={handleSave}
              disabled={isSaving}
            >
              <div className={styles.flexCenter}>
                <Image src="/icon-save.svg" alt="Save" width={12} height={12} />
                {isSaving ? "Saving..." : isSaved ? "Saved" : "Save"}
              </div>
            </button>
            <button type="button" className={styles.inlineActionButton} onClick={handleShare}>
              <div className={styles.flexCenter}>
                <Image src="/icon-share.svg" alt="Share" width={12} height={12} />
                Share
              </div>
            </button>
            <button type="button" className={styles.inlineActionButton} onClick={handleCopy}>
              <div className={styles.flexCenter}>
                <Image src="/icon-copy.svg" alt="Copy" width={12} height={12} />
                {isCopied ? "Copied" : "Copy"}
              </div>
            </button>

            <div className={styles.colorPalette}>
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`${styles.colorDot} ${selectedColor === color ? styles.colorDotActive : ""}`}
                  style={{ backgroundColor: color }}
                  onClick={(event) => handleHighlightColorSelect(event, color)}
                  aria-label={`Select highlight color ${color}`}
                  aria-pressed={selectedColor === color}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
