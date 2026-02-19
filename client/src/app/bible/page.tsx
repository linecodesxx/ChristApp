import BibleList from "@components/BibleList";
import { getBibleData } from "@/lib/storage";
import styles from "./page.module.scss";

export default async function BiblePage() {
  const bible = await getBibleData();

  return (
    <main className={`${styles.main} container`}>
      <h1>Библия</h1>
      <BibleList books={bible.books} />
    </main>
  );
}