import Link from "next/link";
import type { BibleBook } from "@/types/bible";
import styles from "./biblelist.module.scss";

type BibleListProps = {
  books: BibleBook[];
};

export default function BibleList({ books }: BibleListProps) {
  return (
    <ul className={styles.list}>
      {books.map((book) => (
        <li key={book.name} className={styles.item}>
          <Link href={`/bible/${encodeURIComponent(book.name)}`}>{book.name}</Link>
        </li>
      ))}
    </ul>
  );
}