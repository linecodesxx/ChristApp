const API_URL = process.env.NEXT_PUBLIC_BIBLE_API_URL

export async function fetchBooks(translation: string) {
  const res = await fetch(
    `${API_URL}/bible/getBooks/${translation}`
  );

  if (!res.ok) throw new Error("Failed to fetch books");

  return res.json();
}

export async function fetchFullChapter(
  book: string,
  chapter: number,
  translation: string
) {
  const res = await fetch(
    `${API_URL}/bible/fullChap/${encodeURIComponent(
      book
    )}/${chapter}/${translation}`
  );

  if (!res.ok) throw new Error("Failed to fetch chapter");

  return res.json();
}

export async function fetchChapters(book: string, translation: string) {
  const res = await fetch(
    `${API_URL}/bible/${encodeURIComponent(book)}/getChapters/${translation}`
  );

  if (!res.ok) throw new Error('Failed to fetch chapters');

  const data = await res.json();
  return (data.chapterId ?? []).map((chapterId: number) => Number(chapterId));
}

export async function fetchTranslations() {
  const res = await fetch(`${API_URL}/bible/translations`);
  if (!res.ok) throw new Error("Failed to fetch translations");
  return res.json();
}