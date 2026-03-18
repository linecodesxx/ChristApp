const PROXY_URL = '/api/bibleProxy'; // теперь все запросы через прокси

export async function fetchBooks(translation: string) {
  const res = await fetch(`${PROXY_URL}/bible/get-books/${translation}`);
  if (!res.ok) throw new Error("Failed to fetch books");
  return res.json();
}

export async function fetchChapters(bookId: string, translation: string) {
  const books = await fetchBooks(translation) // получаем все книги

  // Ищем книгу по id
  const currentBook = books.find((b: any) => b.id === bookId)
  if (!currentBook) throw new Error("Book not found")

  // Создаём массив глав
  return Array.from({ length: currentBook.chapters }, (_, i) => i + 1)
}

export async function fetchFullChapter(
  book: string,
  chapter: number,
  translation: string
) {
  const res = await fetch(
    `${PROXY_URL}/bible/get-text/${encodeURIComponent(translation)}/${book}/${chapter}`
  );
  if (!res.ok) throw new Error("Failed to fetch chapter");
  return res.json();
}

export async function fetchTranslations() {
  const res = await fetch("/api/bibleProxy/bible/get-languages");
  if (!res.ok) throw new Error("Failed to fetch translations");

  const data = await res.json();

  // Делаем плоский массив всех переводов с info о языке
  const translations = data.flatMap((lang: any) =>
    lang.translations.map((t: any) => ({
      short_name: t.short_name,
      full_name: t.full_name,
      language: lang.language,
      updated: t.updated,
    }))
  );

  return translations;
}