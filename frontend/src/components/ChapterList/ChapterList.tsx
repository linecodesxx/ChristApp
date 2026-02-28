import type { Book, Chapter } from "@/types/bible";
import styles from "./ChapterList.module.scss";

type ChapterListProps = {
  book: Book;
  onSelect?: (chapter: Chapter) => void;
};

export default function ChapterList({ book, onSelect }: ChapterListProps) {
  return (
    <>
      <h2>Главы {book.BookName}</h2>
      <div className={styles.list}>
        {book.Chapters.map((chapter) => (
          <button
            key={chapter.ChapterId}
            onClick={() => onSelect?.(chapter)}
            className={styles.link}
          >
            {chapter.ChapterId}
          </button>
        ))}
      </div>
    </>
  );
}