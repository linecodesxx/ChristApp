'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import type { BibleData, Book, Chapter } from '@/types/bible';
import Verse from '@/components/Verse/Verse';
import BookDropdown from '@/components/BookDropdown/BookDropdown';
import ChapterList from '@/components/ChapterList/ChapterList';
import styles from '../page.module.scss';

type Props = {
  params: Promise<{ book: string; chapter: string }>;
};

export default function ChapterPage({ params }: Props) {
  const { book, chapter } = use(params);
  const router = useRouter();
  const [bible, setBible] = useState<BibleData | null>(null);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [isBookSelectorOpen, setIsBookSelectorOpen] = useState(false);
  const [isChapterSelectorOpen, setIsChapterSelectorOpen] = useState(false);

  useEffect(() => {
    fetch('/nrt.json')
      .then(res => res.json())
      .then((data: BibleData) => {
        setBible(data);
        const bookId = parseInt(book);
        const chapterId = parseInt(chapter);
        const bookData = data.Books.find(b => b.BookId === bookId);
        if (bookData) {
          setSelectedBook(bookData);
          const chapterData = bookData.Chapters.find(c => c.ChapterId === chapterId);
          if (chapterData) {
            setSelectedChapter(chapterData);
          }
        }
      });
  }, [book, chapter]);

  const handleBookSelect = (book: Book) => {
    setSelectedBook(book);
    setSelectedChapter(book.Chapters[0]); // default to first chapter
    setIsBookSelectorOpen(false);
    router.push(`/bible/${book.BookId}/${book.Chapters[0].ChapterId}`);
  };

  const handleChapterSelect = (chapter: Chapter) => {
    setSelectedChapter(chapter);
    setIsChapterSelectorOpen(false);
    if (selectedBook) {
      router.push(`/bible/${selectedBook.BookId}/${chapter.ChapterId}`);
    }
  };

  if (!bible || !selectedBook || !selectedChapter) return <div>Загрузка...</div>;

  return (
    <main className={`${styles.main} container`}>
      {isBookSelectorOpen && (
        <div className={styles.modal}>
          <BookDropdown
            books={bible.Books}
            selectedBook={selectedBook}
            onSelect={handleBookSelect}
          />
          <button onClick={() => setIsBookSelectorOpen(false)}>Закрыть</button>
        </div>
      )}
      {isChapterSelectorOpen && selectedBook && (
        <div className={styles.modal}>
          <ChapterList book={selectedBook} onSelect={handleChapterSelect} />
          <button onClick={() => setIsChapterSelectorOpen(false)}>Закрыть</button>
        </div>
      )}
      <div>
        <div className={styles.header}>
          <div className={styles.headerChapterData}>
            <h1 className={styles.headerBookTitle}>{selectedBook.BookName}</h1>
            <h1 className={styles.headerChapterTitle}>Глава {selectedChapter.ChapterId}</h1>
          </div>

          <div className={styles.headerIcon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M10.5 19C8.80786 18.9998 7.16548 18.4274 5.83978 17.3757C4.51407 16.3241 3.58297 14.855 3.19777 13.2073C2.81256 11.5595 2.9959 9.82996 3.71799 8.29959C4.44008 6.76921 5.65848 5.52801 7.1752 4.77766C8.69192 4.02731 10.4178 3.81193 12.0724 4.16651C13.727 4.52109 15.2131 5.42479 16.2891 6.73076C17.3652 8.03673 17.968 9.66821 17.9996 11.3601C18.0311 13.052 17.4896 14.7048 16.463 16.05L19.799 19.385C19.9812 19.5736 20.082 19.8262 20.0797 20.0884C20.0774 20.3506 19.9723 20.6014 19.7869 20.7868C19.6014 20.9722 19.3506 21.0774 19.0884 21.0797C18.8262 21.082 18.5736 20.9812 18.385 20.799L15.049 17.463C13.7433 18.4622 12.1442 19.0025 10.5 19ZM10.5 16.969C9.04956 16.969 7.6585 16.3928 6.63287 15.3672C5.60723 14.3415 5.03103 12.9505 5.03103 11.5C5.03103 10.0495 5.60723 8.65848 6.63287 7.63284C7.6585 6.6072 9.04956 6.03101 10.5 6.03101C11.9505 6.03101 13.3416 6.6072 14.3672 7.63284C15.3928 8.65848 15.969 10.0495 15.969 11.5C15.969 12.9505 15.3928 14.3415 14.3672 15.3672C13.3416 16.3928 11.9505 16.969 10.5 16.969Z" fill="white"/>
            </svg>
          </div>
        </div>

        <section className={styles.sectionChapter}>
          <h1 className={styles.bookTitle}>{selectedBook.BookName}</h1>

          {selectedChapter.Verses.map((verse) => (
            <Verse
              key={verse.VerseId}
              verse={verse.VerseId}
              text={verse.Text}
              bookName={selectedBook.BookName}
              chapter={selectedChapter.ChapterId}
              onBookClick={() => setIsBookSelectorOpen(true)}
              onChapterClick={() => setIsChapterSelectorOpen(true)}
            />
          ))}
        </section>
      </div>
    </main>
  );
}