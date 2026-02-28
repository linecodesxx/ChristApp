import Link from "next/link";
import styles from "./BibleList.module.scss";

type Verse = {
  VerseId: number;
  Text: string;
};

type Chapter = {
  ChapterId: number;
  Verses: Verse[];
};

type Book = {
  BookId: number;
  BookName: string;
  Chapters: Chapter[];
};

type BibleData = {
  Translation: string;
  Books: Book[];
};

type BibleListProps = {
  data: BibleData;
};

export default function BibleList({ data }: BibleListProps) {
  if (!data?.Books) return null; // защита от undefined

  return (
    <>
      <h2>Перевод: {data.Translation}</h2>

      <ul className={styles.list}>
        {data.Books.map((book) => (
          <li key={book.BookId} className={styles.item}>
            <Link href={`/bible/${book.BookId}`}>
              {book.BookName}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}