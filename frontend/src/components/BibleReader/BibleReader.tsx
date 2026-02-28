'use client';

import { useEffect, useRef, useState } from 'react';
import type { BibleData, Book, Chapter } from '@/types/bible';
import Verse from '@/components/Verse/Verse';
import styles from './BibleReader.module.scss';

type Props = {
  bible: BibleData;
  /** if provided, this book will be selected initially instead of lastRead value */
  initialBookId?: number;
  initialChapterId?: number;
  initialVerseId?: number;
};

export default function BibleReader({ bible, initialBookId, initialChapterId, initialVerseId }: Props) {

  // determine initial selection, using explicit props first or localStorage as fallback
  // compute default selection values (don't read localStorage here as it won't run on server)
  const { initBook, initChap, initVerse } = (() => {
    let book = bible.Books[0];
    let chap = book.Chapters[0];
    let verse = 1;

    if (initialBookId != null) {
      book = bible.Books.find((b) => b.BookId === initialBookId) || book;
    }
    if (initialChapterId != null) {
      chap = book.Chapters.find((c) => c.ChapterId === initialChapterId) || book.Chapters[0];
    }
    if (initialVerseId != null) {
      verse = initialVerseId;
    }

    return { initBook: book, initChap: chap, initVerse: verse };
  })();

  const [progress, setProgress] = useState<{
    book: Book;
    chapter: Chapter;
    verse: number;
  }>({ book: initBook, chapter: initChap, verse: initVerse });

  // independent highlight state for verses (multiple allowed)
  const [highlights, setHighlights] = useState<Set<number>>(new Set());

  // selector modal open
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  // modal step: 'testament' | 'books' | 'chapters'
  type ModalStep = 'testament' | 'books' | 'chapters';
  const [modalStep, setModalStep] = useState<ModalStep>('testament');
  const [selectedTestament, setSelectedTestament] = useState<'old' | 'new'>('old');

  // helper: filter books by testament
  const oldTestamentBooks = bible.Books.filter((b) => b.BookId <= 39);
  const newTestamentBooks = bible.Books.filter((b) => b.BookId > 39);
  const testamentBooks = selectedTestament === 'old' ? oldTestamentBooks : newTestamentBooks;

  // after hydration try to override with stored progress if no explicit props were provided
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (
      initialBookId == null &&
      initialChapterId == null &&
      initialVerseId == null
    ) {
      try {
        const stored = localStorage.getItem('lastRead');
        if (stored) {
          const { bookId, chapterId, verseId } = JSON.parse(stored);
          const b = bible.Books.find((b) => b.BookId === bookId) || bible.Books[0];
          const c = b.Chapters.find((c) => c.ChapterId === chapterId) || b.Chapters[0];
          // schedule update to avoid synchronous setState warning
          setTimeout(() => {
            setProgress({ book: b, chapter: c, verse: verseId || 1 });
          }, 0);
        }
      } catch (e) {
        console.warn('failed to parse lastRead', e);
      }
    }
  }, [bible, initialBookId, initialChapterId, initialVerseId]);


  // persist progress whenever it changes
  useEffect(() => {
    const payload = {
      bookId: progress.book.BookId,
      chapterId: progress.chapter.ChapterId,
      verseId: progress.verse,
    };
    localStorage.setItem('lastRead', JSON.stringify(payload));
  }, [progress]);



  // toggles a verse highlight without affecting reading progress
  const handleVerseClick = (v: number) => {
    setHighlights((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  // navigation helpers: prev/next chapter/book
  const getBookIndex = (bookId: number) => bible.Books.findIndex((b) => b.BookId === bookId);
  const getChapterIndex = (book: Book, chapId: number) => book.Chapters.findIndex((c) => c.ChapterId === chapId);

  const canGoPrev = () => {
    const bi = getBookIndex(progress.book.BookId);
    const ci = getChapterIndex(progress.book, progress.chapter.ChapterId);
    return bi > -1 && (ci > 0 || bi > 0);
  };

  const canGoNext = () => {
    const bi = getBookIndex(progress.book.BookId);
    const ci = getChapterIndex(progress.book, progress.chapter.ChapterId);
    if (bi === -1 || ci === -1) return false;
    if (ci < progress.book.Chapters.length - 1) return true;
    return bi < bible.Books.length - 1;
  };

  const goPrev = () => {
    const bi = getBookIndex(progress.book.BookId);
    const ci = getChapterIndex(progress.book, progress.chapter.ChapterId);
    if (ci > 0) {
      const prevChap = progress.book.Chapters[ci - 1];
      setProgress({ book: progress.book, chapter: prevChap, verse: 1 });
      return;
    }
    if (bi > 0) {
      const prevBook = bible.Books[bi - 1];
      const lastChap = prevBook.Chapters[prevBook.Chapters.length - 1];
      setProgress({ book: prevBook, chapter: lastChap, verse: 1 });
    }
  };

  const goNext = () => {
    const bi = getBookIndex(progress.book.BookId);
    const ci = getChapterIndex(progress.book, progress.chapter.ChapterId);
    if (ci < progress.book.Chapters.length - 1) {
      const nextChap = progress.book.Chapters[ci + 1];
      setProgress({ book: progress.book, chapter: nextChap, verse: 1 });
      return;
    }
    if (bi < bible.Books.length - 1) {
      const nextBook = bible.Books[bi + 1];
      const firstChap = nextBook.Chapters[0];
      setProgress({ book: nextBook, chapter: firstChap, verse: 1 });
    }
  };

  // whenever the selected chapter or verse changes, try scrolling the verse into view
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const el = document.getElementById(`verse-${progress.verse}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [progress.chapter, progress.verse]);

  // touch gesture handling for swipe navigation
  const touchStartX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchEndX - touchStartX.current;
    // swipe right (towards right) = go prev
    if (diff > 70 && canGoPrev()) {
      goPrev();
    }
    // swipe left (towards left) = go next
    if (diff < -70 && canGoNext()) {
      goNext();
    }
  };

  return (
    <main className={styles.main} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* header with clickable book name opens modal */}
      <div className={styles.headerBar}>
        <h2 className={styles.clickable} onClick={() => setIsSelectorOpen(true)}>
          {progress.book.BookName} ⠀
          
        <span>
          {progress.chapter.ChapterId}
        </span>
        </h2>
      </div>

      {isSelectorOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsSelectorOpen(false)}>
          <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <button
                className={styles.backButton}
                onClick={() => {
                  if (modalStep === 'books') setModalStep('testament');
                  else if (modalStep === 'chapters') setModalStep('books');
                }}
                disabled={modalStep === 'testament'}
              >
                ← Назад
              </button>
              <button className={styles.closeModalButton} onClick={() => setIsSelectorOpen(false)}>
                ✕
              </button>
            </div>

            {modalStep === 'testament' && (
              <div className={styles.modalBody}>
                <h3>Выбери завет</h3>
                <div className={styles.testamentGrid}>
                  <button
                    className={`${styles.testamentButton} ${selectedTestament === 'old' ? styles.active : ''}`}
                    onClick={() => {
                      setSelectedTestament('old');
                      setModalStep('books');
                    }}
                  >
                    Ветхий Завет
                  </button>
                  <button
                    className={`${styles.testamentButton} ${selectedTestament === 'new' ? styles.active : ''}`}
                    onClick={() => {
                      setSelectedTestament('new');
                      setModalStep('books');
                    }}
                  >
                    Новый Завет
                  </button>
                </div>
              </div>
            )}

            {modalStep === 'books' && (
              <div className={styles.modalBody}>
                <h3>{selectedTestament === 'old' ? 'Ветхий Завет' : 'Новый Завет'}</h3>
                <div className={styles.booksList}>
                  {testamentBooks.map((book) => (
                    <button
                      key={book.BookId}
                      className={`${styles.bookButton} ${progress.book.BookId === book.BookId ? styles.active : ''}`}
                      onClick={() => {
                        setProgress({ book, chapter: book.Chapters[0], verse: 1 });
                        setModalStep('chapters');
                      }}
                    >
                      {book.BookName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {modalStep === 'chapters' && (
              <div className={styles.modalBody}>
                <h3>{progress.book.BookName}</h3>
                <div className={styles.chaptersList}>
                  {progress.book.Chapters.map((chap) => (
                    <button
                      key={chap.ChapterId}
                      className={`${styles.chapterButton} ${progress.chapter.ChapterId === chap.ChapterId ? styles.active : ''}`}
                      onClick={() => {
                        setProgress((prev) => ({ ...prev, chapter: chap, verse: 1 }));
                        setIsSelectorOpen(false);
                        setModalStep('testament');
                      }}
                    >
                      {chap.ChapterId}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* floating navigation buttons */}
      <div className={styles.floatingNavLeft}>
        <button aria-label="previous chapter" onClick={goPrev} disabled={!canGoPrev()} className={styles.navButton}>⬅</button>
      </div>
      <div className={styles.floatingNavRight}>
        <button aria-label="next chapter" onClick={goNext} disabled={!canGoNext()} className={styles.navButton}>➡</button>
      </div>

      <section className={styles.versesSection}>
        {progress.chapter.Verses.map((v) => (
          <Verse
            key={v.VerseId}
            verse={v.VerseId}
            text={v.Text}
            selected={highlights.has(v.VerseId)}
            onVerseClick={handleVerseClick}
            bookName={progress.book.BookName}
            chapter={progress.chapter.ChapterId}
            // give an id so we can scroll to it
            id={`verse-${v.VerseId}`}
          />
        ))}
      </section>
    </main>
  );
}
