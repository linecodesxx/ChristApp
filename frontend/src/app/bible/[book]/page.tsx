import { getBibleData } from "@/lib/storage"
import styles from "./page.module.scss"
import BibleReader from "@/components/BibleReader/BibleReader";

type Props = {
  params: Promise<{ book: string }>;
  searchParams?: { chapter?: string; verse?: string };
};

export default async function BookPage({ params }: Props) {
  const { book } = await params;
  const bible = await getBibleData();
  const bookId = parseInt(book);
  const selectedBook = bible.Books.find((item) => item.BookId === bookId);

  if (!selectedBook) return <div>Книга не найдена</div>;

  // parse optional chapter/verse from query
  const chapterId = searchParams?.chapter ? parseInt(searchParams.chapter) : undefined;
  const verseId = searchParams?.verse ? parseInt(searchParams.verse) : undefined;

  return (
    <main className={`${styles.main} container`}>
      <BibleReader
        bible={bible}
        initialBookId={bookId}
        initialChapterId={chapterId}
        initialVerseId={verseId}
      />
    </main>
  );
}
