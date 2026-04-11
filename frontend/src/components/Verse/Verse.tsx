"use client"

import { useCallback, useEffect, useMemo, useRef, useState, memo, type ChangeEvent } from "react"
import styles from "./Verse.module.scss"
import { ScriptureText } from "@/components/ScriptureText/ScriptureText"
import { scripturePlainText } from "@/lib/sanitizeScriptureHtml"
import { saveVerse } from "@/lib/versesApi"
import { VERSE_HIGHLIGHT_STORAGE_KEY, isValidHighlightHex } from "@/lib/verseHighlightStorage"
import Image from "next/image"
import { useQueryClient } from "@tanstack/react-query"
import { savedVersesQueryKey } from "@/lib/queries/versesQueries"

const selectedVersesClipboardStore = new Map<string, string>()
const colors = ["#e92441", "#C4A265", "#64B5F6", "#81C784", "#BA68C8"]

export function getSelectedVersesClipboardText() {
  return Array.from(selectedVersesClipboardStore.values()).join("\n")
}

/** Сброс мультивыбора в памяти (после покраски и т.п.) */
export function clearVerseSelectionClipboard() {
  selectedVersesClipboardStore.clear()
}

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
  activeActionsVerseKey?: string | null
  onOpenActions?: (verseKey: string) => void
  onShareClick?: () => void
  /** Сдвигается после записи в localStorage — перечитать цвет подсветки */
  highlightStorageEpoch?: number
  /** Если задано, выбор цвета в плашке красит все выделенные стихи главы (через родителя) */
  onApplyHighlightColorToSelection?: (
    color: string | null,
    options?: { closeToolbar?: boolean },
  ) => void
}

function Verse({
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
  activeActionsVerseKey,
  onOpenActions,
  onShareClick,
  highlightStorageEpoch = 0,
  onApplyHighlightColorToSelection,
}: VerseProps) {
  const queryClient = useQueryClient()
  const [isClicked, setIsClicked] = useState(false)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  
  const isSelected = typeof selected === "boolean" ? selected : isClicked
  const verseKey = `${bookName ?? ""}|${chapter ?? 0}|${verse}|${text}`
  const actionVerseKey = `${bookName ?? ""}|${chapter ?? 0}|${verse}`
  
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  
  const [isCopied, setIsCopied] = useState(false)
  const [isActionsVisible, setIsActionsVisible] = useState(false)
  
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const verseReference = `${bookName ? `${bookName} ` : ""}${chapter ? `${chapter}:` : ""}${verse}`
  const plainText = useMemo(() => scripturePlainText(text), [text])
  const verseLine = `${verseReference} - ${plainText}`
  
  

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
    if (selected === false) {
      setIsClicked(false)
    }
  }, [selected])

  useEffect(() => {
    if (activeActionsVerseKey !== actionVerseKey) {
      setIsActionsVisible(false)
    }
  }, [activeActionsVerseKey, actionVerseKey])

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
      if (savedColor && isValidHighlightHex(savedColor)) {
        setSelectedColor(savedColor)
        return
      }

      setSelectedColor(null)
    } catch {
      setSelectedColor(null)
    }
  }, [verseKey, highlightStorageEpoch])

  const handleClick = () => {
    const canUseActions = isSelected || Boolean(selectedColor)

    if (canUseActions && activeActionsVerseKey !== actionVerseKey) {
      onOpenActions?.(actionVerseKey)
      setIsActionsVisible(true)
      syncClipboardSelection(true)
      return
    }

    if (!isSelected && selectedColor) {
      setIsActionsVisible(true)
      onOpenActions?.(actionVerseKey)
      syncClipboardSelection(true)
      return
    }

    const nextIsClicked = !isSelected
    if (typeof selected !== "boolean") {
      setIsClicked(nextIsClicked)
    }
    setIsActionsVisible(true)
    onOpenActions?.(actionVerseKey)
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
      void queryClient.invalidateQueries({ queryKey: savedVersesQueryKey() })

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
      void queryClient.invalidateQueries({ queryKey: savedVersesQueryKey() })
    } finally {
      setIsSaving(false)
    }
  }

  const handleShare = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onShareClick?.()
  }

  const handleCopy = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return
    const selectedText = getSelectedVersesClipboardText()
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

    if (onApplyHighlightColorToSelection) {
      onApplyHighlightColorToSelection(nextColor)
      return
    }

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

  const handleCustomColorInput = (event: ChangeEvent<HTMLInputElement>) => {
    const pickedColor = event.target.value
    if (!pickedColor || !isValidHighlightHex(pickedColor)) {
      return
    }

    setSelectedColor(pickedColor)

    if (onApplyHighlightColorToSelection) {
      onApplyHighlightColorToSelection(pickedColor, { closeToolbar: false })
      return
    }

    if (typeof window === "undefined") return

    try {
      const rawValue = window.localStorage.getItem(VERSE_HIGHLIGHT_STORAGE_KEY)
      const parsed = rawValue ? (JSON.parse(rawValue) as Record<string, string>) : {}
      parsed[verseKey] = pickedColor
      window.localStorage.setItem(VERSE_HIGHLIGHT_STORAGE_KEY, JSON.stringify(parsed))
    } catch {
      // no-op
    }
  }

  const paintedColorStyle = selectedColor
    ? ({
        "--painted-border-color": selectedColor,
        "--painted-background": `color-mix(in srgb, ${selectedColor} 22%, transparent)`,
      } as React.CSSProperties)
    : undefined

  const showSelectionRing = isSelected && !selectedColor
  const showPainted = Boolean(selectedColor)
  const selectedFromPreset = Boolean(selectedColor && colors.includes(selectedColor))
  const showActionBar =
    showInlineActions &&
    isActionsVisible &&
    activeActionsVerseKey === actionVerseKey &&
    (isSelected || Boolean(selectedColor))

  return (
    <div className={styles.verseContainer} id={id}>
      <div className={styles.verseRow}>
        <p className={styles.verse} onClick={handleClick}>
          <span
            className={`${showPainted ? styles.painted : ""} ${showSelectionRing ? styles.selectionRing : ""} ${isCopied ? styles.copied : ""}`}
            style={paintedColorStyle}
          >
            <sup className={verse === 1 ? styles.verseSupLarge : styles.verseSup}>{verse}</sup>
            <ScriptureText as="span" html={text} className={styles.verseText} />
          </span>
        </p>

        {showActionBar ? (
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
              <label
                className={`${styles.customColorInputWrap} ${selectedColor && !selectedFromPreset ? styles.customColorInputWrapActive : ""}`}
                aria-label="Выбрать свой цвет подсветки"
              >
                <input
                  type="color"
                  className={styles.customColorInput}
                  value={selectedColor ?? "#C4A265"}
                  onClick={(event) => event.stopPropagation()}
                  onChange={handleCustomColorInput}
                />
              </label>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default memo(Verse, (prev, next) => {
  return (
    prev.selected === next.selected &&
    prev.text === next.text &&
    prev.highlightStorageEpoch === next.highlightStorageEpoch &&
    prev.activeActionsVerseKey === next.activeActionsVerseKey
  )
})