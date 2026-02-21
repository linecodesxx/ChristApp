import { getBibleData } from "@/lib/storage"
import styles from "./page.module.scss"
import path from "path/win32"
import ChapterViewer from "@/components/ChapterViewer/ChapterViewer"

type Props = {
  params: Promise<{ book: string }>
}

export default async function BookPage({ params }: Props) {
  const { book } = await params
  const bible = await getBibleData()
  const decodedBook = decodeURIComponent(book)
  const selectedBook = bible.books.find((item) => item.name === decodedBook)

  if (!selectedBook) return <div>Книга не найдена</div>

  return (
    <main className={`${styles.main} container`}>
      <ChapterViewer book={selectedBook} />
    </main>
  )
}
