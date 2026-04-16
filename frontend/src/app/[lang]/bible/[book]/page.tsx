import styles from "./page.module.scss"
import BibleReader from "@/components/BibleReader/BibleReader";

type Props = {
  params: Promise<{ book: string }>;
  searchParams?: Promise<{ chapter?: string; verse?: string }>;
};

export default async function BookPage({ params, searchParams }: Props) {
  const { book } = await params;
  const sp = searchParams ? await searchParams : {};
  const chapterId = sp.chapter ? parseInt(sp.chapter) : undefined;
  const verseId = sp.verse ? parseInt(sp.verse) : undefined;

  return (
    <main className={`${styles.main} container`}>
      <BibleReader
        initialBookId={book}
        initialChapterId={chapterId}
        initialVerseId={verseId}
      />
    </main>
  );
}
