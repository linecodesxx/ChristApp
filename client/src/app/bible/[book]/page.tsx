import Link from "next/link";
import Verse from "@/components/Verse";
import { getBibleData } from "@/lib/storage";
import styles from "./page.module.scss";

type Props = {
  params: Promise<{ book: string }>;
};

export default async function BookPage({ params }: Props) {
  const { book } = await params;
  const bible = await getBibleData();
  const decodedBook = decodeURIComponent(book);
  const selectedBook = bible.books.find((item) => item.name === decodedBook);

  if (!selectedBook) {
    return (
      <main className={`${styles.main} container`}>
        <h1>Книга не найдена</h1>
        <Link href="/bible">Вернуться к списку</Link>
      </main>
    );
  }

  return (
    <main className={`${styles.main} container`}>
      <h1>{selectedBook.name}</h1>
      {selectedBook.chapters.map((chapter, chapterIndex) => (
        <section key={`${selectedBook.name}-${chapterIndex}`} className={styles.chapter}>
          <h2>Глава {chapterIndex + 1}</h2>
          {chapter.map((text, verseIndex) => (
            <Verse key={`${chapterIndex}-${verseIndex}`} verse={verseIndex + 1} text={text} />
          ))}
        </section>
      ))}
    </main>
  );
}