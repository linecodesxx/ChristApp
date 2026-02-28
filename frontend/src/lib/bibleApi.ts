const API_URL = process.env.BIBLE_API_URL || "http://localhost:3002";

export async function fetchBooks(translation: string) {
  const res = await fetch(
    `http://localhost:3002/bible/getBooks/${translation}`
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
    `http://localhost:3002/bible/fullChap/${encodeURIComponent(
      book
    )}/${chapter}/${translation}`
  );

  if (!res.ok) throw new Error("Failed to fetch chapter");

  return res.json();
}

export async function fetchTranslations() {
  const res = await fetch(`${API_URL}/bible/translations`);
  if (!res.ok) throw new Error("Failed to fetch translations");
  return res.json();
}