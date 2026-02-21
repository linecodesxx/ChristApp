'use client';

import { useState } from "react";
import Verse from "@/components/Verse/Verse";

import styles from "./ChapterViewer.module.scss";

type Props = {
  book: {
    name: string;
    chapters: string[][];
  };
};

export default function ChapterViewer({ book }: Props) {
  const [currentChapter, setCurrentChapter] = useState(0);

  const nextChapter = () => {
    if (currentChapter < book.chapters.length - 1) {
      setCurrentChapter((prev) => prev + 1);
    }
  };

  const prevChapter = () => {
    if (currentChapter > 0) {
      setCurrentChapter((prev) => prev - 1);
    }
  };

  // swipe
  let touchStartX = 0;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX;
    if (diff > 70) prevChapter();
    if (diff < -70) nextChapter();
  };

  const chapter = book.chapters[currentChapter];

  return (
    <div
      className={styles.viewer}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 🔥 HEADER ВОЗВРАЩЁН */}
      <div className={styles.header}>
        <div className={styles.headerChapterData}>
          <h1 className={styles.headerBookTitle}>{book.name}</h1>
          <h1 className={styles.headerChapterTitle}>
            Глава {currentChapter + 1}
          </h1>
        </div>

        <div className={styles.headerIcon}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M10.5 19C8.80786 18.9998 7.16548 18.4274 5.83978 17.3757C4.51407 16.3241 3.58297 14.855 3.19777 13.2073C2.81256 11.5595 2.9959 9.82996 3.71799 8.29959C4.44008 6.76921 5.65848 5.52801 7.1752 4.77766C8.69192 4.02731 10.4178 3.81193 12.0724 4.16651C13.727 4.52109 15.2131 5.42479 16.2891 6.73076C17.3652 8.03673 17.968 9.66821 17.9996 11.3601C18.0311 13.052 17.4896 14.7048 16.463 16.05L19.799 19.385C19.9812 19.5736 20.082 19.8262 20.0797 20.0884C20.0774 20.3506 19.9723 20.6014 19.7869 20.7868C19.6014 20.9722 19.3506 21.0774 19.0884 21.0797C18.8262 21.082 18.5736 20.9812 18.385 20.799L15.049 17.463C13.7433 18.4622 12.1442 19.0025 10.5 19Z"
              fill="white"
            />
          </svg>
        </div>
      </div>

      {/* 📖 Стихи */}
      <section className={styles.sectionChapter}>
            <h1 className={styles.bookTitle}>{book.name}</h1>
        
        {chapter.map((text, verseIndex) => (
          <Verse
            key={`${currentChapter}-${verseIndex}`}
            verse={verseIndex + 1}
            text={text}
          />
        ))}
      </section>

      {/* ⬅➡ Floating arrows */}
      <div className={styles.floatingNav}>
        <button onClick={prevChapter} disabled={currentChapter === 0}>
          ⬅
        </button>
        <button
          onClick={nextChapter}
          disabled={currentChapter === book.chapters.length - 1}
        >
          ➡
        </button>
      </div>
    </div>
  );
}
