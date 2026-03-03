'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Verse.module.scss";
import { saveVerse } from "@/lib/versesApi";

const selectedVersesClipboardStore = new Map<string, string>();
const VERSE_COPY_BATCH_EVENT = "verse-copy-batch";

type VerseProps = {
  verse: number;
  text: string;
  bookName?: string;
  chapter?: number;
  translation?: string;
  onBookClick?: () => void;
  onChapterClick?: () => void;
  /** called when verse is clicked (in addition to internal highlighting) */
  onVerseClick?: (verse: number) => void;
  /** external selection state (e.g. last read verse) */
  selected?: boolean;
  /** optional id attribute (used for scrolling) */
  id?: string;
  /** show Save/Share actions near selected verse */
  showInlineActions?: boolean;
};

export default function Verse({ verse, text, bookName, chapter, translation = "default", onBookClick, onChapterClick, onVerseClick, selected, id, showInlineActions }: VerseProps) {
  const [isClicked, setIsClicked] = useState(false);
  const [isCopyGlow, setIsCopyGlow] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const copyGlowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verseReference = `${bookName ? `${bookName} ` : ""}${chapter ? `${chapter}:` : ""}${verse}`;
  const verseLine = `${verseReference} - ${text}`;
  const verseKey = `${bookName ?? ""}|${chapter ?? 0}|${verse}|${text}`;
  const isSelected = typeof selected === "boolean" ? selected : isClicked;

  void onBookClick;
  void onChapterClick;

  const syncClipboardSelection = useCallback(
    (nextSelected: boolean, shouldWrite: boolean) => {
      if (nextSelected) {
        selectedVersesClipboardStore.set(verseKey, verseLine);
      } else {
        selectedVersesClipboardStore.delete(verseKey);
      }

      if (!shouldWrite) return;
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;

      const nextClipboard = Array.from(selectedVersesClipboardStore.values()).join("\n");
      void navigator.clipboard.writeText(nextClipboard).catch(() => undefined);
    },
    [verseKey, verseLine],
  );

  const triggerCopyGlow = useCallback(() => {
    setIsCopyGlow(true);

    if (copyGlowTimeoutRef.current) {
      clearTimeout(copyGlowTimeoutRef.current);
    }

    copyGlowTimeoutRef.current = setTimeout(() => {
      setIsCopyGlow(false);
      copyGlowTimeoutRef.current = null;
    }, 650);
  }, []);

  useEffect(() => {
    if (typeof selected === "boolean") {
      syncClipboardSelection(selected, false);
    }
  }, [selected, syncClipboardSelection]);

  useEffect(() => {
    return () => {
      selectedVersesClipboardStore.delete(verseKey);
      if (copyGlowTimeoutRef.current) {
        clearTimeout(copyGlowTimeoutRef.current);
      }
    };
  }, [verseKey]);

  useEffect(() => {
    const handleCopyBatch = () => {
      if (!isSelected) return;
      triggerCopyGlow();
    };

    window.addEventListener(VERSE_COPY_BATCH_EVENT, handleCopyBatch);

    return () => {
      window.removeEventListener(VERSE_COPY_BATCH_EVENT, handleCopyBatch);
    };
  }, [isSelected, triggerCopyGlow]);

  const handleClick = () => {
    const nextIsClicked = !isSelected;
    if (typeof selected !== "boolean") {
      setIsClicked(nextIsClicked);
    }
    onVerseClick?.(verse);
    syncClipboardSelection(nextIsClicked, false);
  };

  const handleSave = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    
    if (!bookName || !chapter) {
      console.error("Missing book or chapter information");
      return;
    }

    try {
      setIsSaving(true);
      await saveVerse(bookName, chapter, verse, text, translation);
      setIsSaved(true);
      
      // Reset saved state after 2 seconds
      setTimeout(() => {
        setIsSaved(false);
      }, 2000);
    } catch (error) {
      const catchError = error as Error & { message: string };
      console.error("Failed to save verse", catchError);
      // Check if it's already saved
      if (catchError.message.includes("already")) {
        setIsSaved(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(verseLine).catch(() => undefined);
  };

  const handleCopy = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    const selectedText = Array.from(selectedVersesClipboardStore.values()).join("\n");
    const textToCopy = selectedText || verseLine;

    void navigator.clipboard.writeText(textToCopy)
      .then(() => {
        window.dispatchEvent(new Event(VERSE_COPY_BATCH_EVENT));
      })
      .catch(() => undefined);
  };

  return (
    <div className={styles.verseContainer} id={id}>
      <div className={styles.verseRow}>
        <p
          className={`${styles.verse} ${isSelected ? styles.selected : ""} ${isCopyGlow ? styles.copyGlow : ""}`}
          onClick={handleClick}
        >
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
          {text}
        </p>

        {showInlineActions && isSelected ? (
          <div className={styles.inlineActions}>
            <button 
              type="button" 
              className={`${styles.inlineActionButton} ${isSaved ? styles.saved : ""}`} 
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : isSaved ? "Saved" : "Save"}
            </button>
            <button type="button" className={styles.inlineActionButton} onClick={handleShare}>
              Share
            </button>
            <button type="button" className={styles.inlineActionButton} onClick={handleCopy}>
              Copy
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}