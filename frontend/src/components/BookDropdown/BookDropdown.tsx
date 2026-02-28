'use client';

import { useState } from 'react';
import type { Book } from '@/types/bible';
import styles from './BookDropdown.module.scss';

type BookDropdownProps = {
  books: Book[];
  selectedBook: Book;
  onSelect: (book: Book) => void;
};

export default function BookDropdown({ books, selectedBook, onSelect }: BookDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (book: Book) => {
    onSelect(book);
    setIsOpen(false);
  };

  return (
    <div className={styles.dropdown}>
      <button
        className={styles.selectButton}
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedBook.BookName} ▼
      </button>

      {isOpen && (
        <ul className={styles.list}>
          {books.map((book) => (
            <li key={book.BookId} className={styles.item}>
              <button
                className={styles.itemButton}
                onClick={() => handleSelect(book)}
              >
                {book.BookName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}