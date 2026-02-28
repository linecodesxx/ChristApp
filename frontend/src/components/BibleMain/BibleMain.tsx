'use client';

import { useState } from 'react';
import type { BibleData, Book } from '@/types/bible';
import BookDropdown from '@/components/BookDropdown/BookDropdown';
import ChapterList from '@/components/ChapterList/ChapterList';
import styles from './BibleMain.module.scss';

type Props = {
  bible: BibleData;
  defaultBook: Book;
};

export default function BibleMain({ bible, defaultBook }: Props) {
  const [selectedBook, setSelectedBook] = useState<Book>(defaultBook);

  const handleBookSelect = (book: Book) => {
    setSelectedBook(book);
  };

  return (
    <main className={styles.main}>
      <h1>Библия</h1>

      <BookDropdown
        books={bible.Books}
        selectedBook={selectedBook}
        onSelect={handleBookSelect}
      />

      <ChapterList book={selectedBook} />
    </main>
  );
}