"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Verse from "@/components/Verse/Verse";
import {
  fetchChapters,
  fetchBooks,
  fetchFullChapter,
  fetchTranslations,
} from "@/lib/bibleApi";
import styles from "./BibleReader.module.scss";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import CrossLoader from "@/components/CrossLoader/CrossLoader";

type VerseType = {
  pk: number;
  verse: number;
  text: string;
};

type TranslationType = {
  short_name: string;
  full_name: string;
  updated: number;
  language: string;
};

type BookType = {
  id: string;
  name: string;
  chapters: number;
};

type ModalStep = "testament" | "books" | "chapters";

const SHOW_VERSE_ACTIONS = true;
const LAST_READ_STORAGE_KEY = "lastRead";
const SESSION_HIGHLIGHTS_KEY = "bible-reader-highlights";

export default function BibleReader() {
  /** Только после mount — без запросов к API на сервере при SSR, чтобы не было рассинхрона гидрации. */
  const [isMounted, setIsMounted] = useState(false);

  const [books, setBooks] = useState<BookType[]>([]);
  const [chapters, setChapters] = useState<number[]>([]);
  const [translations, setTranslations] = useState<TranslationType[]>([]);
  const [translation, setTranslation] = useState("NRT");

  const [currentBook, setCurrentBook] = useState<BookType | null>(null);
  const [currentChapter, setCurrentChapter] = useState(1);

  const [highlights, setHighlights] = useState<Set<string>>(new Set());
  const [isHighlightsHydrated, setIsHighlightsHydrated] = useState(false);

  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>("testament");
  const [selectedTestament, setSelectedTestament] = useState<"old" | "new">(
    "old",
  );

  const touchStartX = useRef(0);

  // ===== LOAD CHAPTER =====
  const loadChapter = useCallback((book: BookType, chapter: number) => {
    setCurrentBook(book);
    setCurrentChapter(chapter);
    window.scrollTo({ top: 0, behavior: "smooth" });

    localStorage.setItem(
      LAST_READ_STORAGE_KEY,
      JSON.stringify({ bookId: book.id, chapter }),
    );
  }, []);

  // ===== HIGHLIGHTS =====
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(SESSION_HIGHLIGHTS_KEY);
      if (!raw) return setHighlights(new Set());
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return setHighlights(new Set());
      setHighlights(new Set(parsed.filter((x: any) => typeof x === "string")));
    } catch {
      setHighlights(new Set());
    } finally {
      setIsHighlightsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHighlightsHydrated || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        SESSION_HIGHLIGHTS_KEY,
        JSON.stringify(Array.from(highlights)),
      );
    } catch {}
  }, [highlights, isHighlightsHydrated]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // ===== INIT =====
  useEffect(() => {
    if (!isMounted) return;

    async function init() {
      const [translationsData, booksData] = await Promise.all([
        fetchTranslations(),
        fetchBooks(translation),
      ]);
      setTranslations(translationsData);
      setBooks(booksData);

      if (!booksData.length) return;

      let bookToLoad = booksData[0];
      let chapterToLoad = 1;

      // Пытаемся восстановить последний прочитанный
      try {
        const raw = window.localStorage.getItem(LAST_READ_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as {
            bookId?: string;
            chapter?: number;
          };
          const found = booksData.find((b: any) => b.id === parsed.bookId);
          if (found) bookToLoad = found;
          if (parsed.chapter) chapterToLoad = parsed.chapter;
        }
      } catch {}

      const bookChapters = await fetchChapters(bookToLoad.id, translation);
      if (!bookChapters.includes(chapterToLoad)) chapterToLoad = 1;
      setChapters(bookChapters);

      loadChapter(bookToLoad, chapterToLoad);
    }
    void init();
  }, [translation, loadChapter, isMounted]);

  // ===== TESTAMENT FILTER =====
  const oldTestamentBooks = books.filter((b) => {
    // ID первых 39 книг – Ветхий Завет (GEN…MAL)
    const oldIds = [
      "GEN",
      "EXO",
      "LEV",
      "NUM",
      "DEU",
      "JOS",
      "JDG",
      "RUT",
      "1SA",
      "2SA",
      "1KI",
      "2KI",
      "1CH",
      "2CH",
      "EZR",
      "NEH",
      "EST",
      "JOB",
      "PSA",
      "PRO",
      "ECC",
      "SNG",
      "ISA",
      "JER",
      "LAM",
      "EZK",
      "DAN",
      "HOS",
      "JOL",
      "AMO",
      "OBA",
      "JON",
      "MIC",
      "NAM",
      "HAB",
      "ZEP",
      "HAG",
      "ZEC",
      "MAL",
    ];
    return oldIds.includes(b.id);
  });

  const newTestamentBooks = books.filter((b) => !oldTestamentBooks.includes(b));
  const testamentBooks =
    selectedTestament === "old" ? oldTestamentBooks : newTestamentBooks;

  // ===== NAVIGATION =====
  const isFirstChapter = currentBook ? currentChapter === 1 && oldTestamentBooks.indexOf(currentBook) === 0 : false;
  const isLastChapter = currentBook ? currentChapter === currentBook.chapters : false;
  const isLastBook = currentBook ? newTestamentBooks.indexOf(currentBook) !== -1 && currentBook.id === newTestamentBooks[newTestamentBooks.length - 1].id : false;

  const goNext = useCallback(() => {
    if (!currentBook) return;
    if (currentChapter < currentBook.chapters) {
      loadChapter(currentBook, currentChapter + 1);
    } else {
      const currentBookIndex = books.findIndex((b) => b.id === currentBook.id);
      const nextBook = books[currentBookIndex + 1];
      if (nextBook) {
        loadChapter(nextBook, 1);
      }
    }
  }, [currentBook, currentChapter, books, loadChapter]);

  const goPrev = useCallback(() => {
    if (!currentBook) return;
    if (currentChapter > 1) {
      loadChapter(currentBook, currentChapter - 1);
    } else {
      const currentBookIndex = books.findIndex((b) => b.id === currentBook.id);
      const prevBook = books[currentBookIndex - 1];
      if (prevBook) {
        loadChapter(prevBook, prevBook.chapters);
      }
    }
  }, [currentBook, books, loadChapter]);

  const getHighlightKey = (bookId: string, chapter: number, verse: number) =>
    `${bookId}|${chapter}|${verse}`;

  const handleVerseClick = useCallback(
    (verse: number) => {
      if (!currentBook) return;

      const key = getHighlightKey(currentBook.id, currentChapter, verse);

      setHighlights((prev) => {
        const next = new Set(prev);

        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    },
    [currentBook, currentChapter],
  );

  const handleTouchStart = (e: React.TouchEvent) =>
    (touchStartX.current = e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (diff > 70) goPrev();
    if (diff < -70) goNext();
  };

  const { data: verses, isLoading } = useQuery({
    queryKey: ["chapter", translation, currentBook?.id, currentChapter],
    queryFn: () => {
      if (!currentBook) return Promise.resolve([] as VerseType[]);
      return fetchFullChapter(currentBook.id, currentChapter, translation);
    },
    enabled: isMounted && Boolean(currentBook),
    staleTime: 1000 * 60 * 60, // 1 час
  });

  const memomizedVerses = useMemo(() => {
    if (!currentBook || !verses) return [];

    return verses.map((v: any) => ({
      ...v,
      selected: highlights.has(
        getHighlightKey(currentBook.id, currentChapter, v.verse),
      ),
    }));
  }, [verses, highlights, currentBook, currentChapter]);

  if (!isMounted || !currentBook || isLoading) {
    return (
      <div className={styles.loadingState}>
        <CrossLoader label="Загрузка главы" variant="inline" />
      </div>
    );
  }

  return (
    <section
      className={styles.bibleReader}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* HEADER */}
      <div className={styles.headerBar}>
        <h2
          className={styles.clickable}
          onClick={() => setIsSelectorOpen(true)}
        >
          {currentBook.name} {currentChapter}
        </h2>

        <select
          value={translation}
          onChange={(e) => setTranslation(e.target.value)}
        >
          {translations.map((t) => (
            <option key={t.short_name} value={t.short_name}>
              {t.short_name} ({t.language})
            </option>
          ))}
        </select>
      </div>

      {/* MODAL */}
      {isSelectorOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setIsSelectorOpen(false)}
        >
          <div
            className={styles.modalSheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <button
                className={styles.backButton}
                onClick={() => {
                  if (modalStep === "books") setModalStep("testament");
                  else if (modalStep === "chapters") setModalStep("books");
                }}
                disabled={modalStep === "testament"}
              >
                ← Назад
              </button>
              <button
                className={styles.closeModalButton}
                onClick={() => setIsSelectorOpen(false)}
              >
                ✕
              </button>
            </div>

            {modalStep === "testament" && (
              <div className={styles.modalBody}>
                <h3>Выбери завет</h3>
                <div className={styles.testamentGrid}>
                  <button
                    className={`${styles.testamentButton} ${selectedTestament === "old" ? styles.active : ""}`}
                    onClick={() => {
                      setSelectedTestament("old");
                      setModalStep("books");
                    }}
                  >
                    Ветхий Завет
                  </button>

                  <button
                    className={`${styles.testamentButton} ${selectedTestament === "new" ? styles.active : ""}`}
                    onClick={() => {
                      setSelectedTestament("new");
                      setModalStep("books");
                    }}
                  >
                    Новый Завет
                  </button>
                </div>
              </div>
            )}

            {modalStep === "books" && (
              <div className={styles.modalBody}>
                <h3>
                  {selectedTestament === "old" ? "Ветхий Завет" : "Новый Завет"}
                </h3>
                <div className={styles.booksList}>
                  {testamentBooks.map((b) => (
                    <button
                      className={`${styles.bookButton} ${currentBook.id === b.id ? styles.active : ""}`}
                      key={b.id}
                      onClick={async () => {
                        setCurrentBook(b);
                        const bookChapters = await fetchChapters(
                          b.id,
                          translation,
                        );
                        setChapters(bookChapters);
                        setModalStep("chapters");
                      }}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {modalStep === "chapters" && (
              <div className={styles.modalBody}>
                <h3>{currentBook.name}</h3>
                <div className={styles.chaptersList}>
                  {chapters.map((c) => (
                    <button
                      type="button"
                      className={`${styles.chapterButton} ${currentChapter === c ? styles.active : ""}`}
                      key={c}
                      onClick={() => {
                        loadChapter(currentBook, c);
                        setIsSelectorOpen(false);
                        setModalStep("testament");
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FLOATING NAV */}
      <div className={styles.floatingNavLeft}>
        <button
          aria-label="previous chapter"
          onClick={goPrev}
          className={styles.navButton}
          disabled={isFirstChapter}
        >
          <Image
            src="/icon-arrow-left.svg"
            alt="Previous Chapter"
            width={24}
            height={24}
          />
        </button>
      </div>
      <div className={styles.floatingNavRight}>
        <button
          aria-label="next chapter"
          onClick={goNext}
          className={styles.navButton}
          disabled={isLastBook && isLastChapter}
        >
          <Image
            src="/icon-arrow-right.svg"
            alt="Next Chapter"
            width={24}
            height={24}
          />
        </button>
      </div>

      {/* VERSES */}
      <section className={styles.versesSection}>
        {memomizedVerses.map((v: any) => (
          <Verse
            key={v.pk}
            verse={v.verse}
            text={v.text}
            selected={v.selected}
            onVerseClick={handleVerseClick}
            bookName={currentBook!.name}
            chapter={currentChapter}
            translation={translation}
            id={`verse-${v.verse}`}
            showInlineActions={SHOW_VERSE_ACTIONS}
          />
        ))}
      </section>
    </section>
  );
}
