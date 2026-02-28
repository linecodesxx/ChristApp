'use client';

import { useEffect, useState } from "react";
import styles from "./Verse.module.scss";

type VerseProps = {
  verse: number;
  text: string;
  bookName?: string;
  chapter?: number;
  onBookClick?: () => void;
  onChapterClick?: () => void;
  /** called when verse is clicked (in addition to internal highlighting) */
  onVerseClick?: (verse: number) => void;
  /** external selection state (e.g. last read verse) */
  selected?: boolean;
  /** optional id attribute (used for scrolling) */
  id?: string;
};

export default function Verse({ verse, text, bookName, chapter, onBookClick, onChapterClick, onVerseClick, selected, id }: VerseProps) {
  const [isClicked, setIsClicked] = useState(false);

  // when parent marks this verse as selected, reflect that in state as well
  useEffect(() => {
    if (selected) {
      setIsClicked(true);
    }
  }, [selected]);

  const handleClick = () => {
    setIsClicked(!isClicked);
    onVerseClick?.(verse);
    navigator.clipboard.writeText(`${bookName ? bookName + ' ' : ''}${chapter ? chapter + ':' : ''}${verse} - ${text}`);
  };

  useEffect(() => {
    // effect for verse 1
  })

  return (
    <div className={styles.verseContainer} id={id}>
      <p
        className={`${styles.verse} ${isClicked ? styles.selected : ""}`}
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
    </div>
  );
}