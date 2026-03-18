const API_URL = "https://api.prayerpulse.io";

// ===== BASE FETCH =====
async function safeFetch(url: string) {
  try {
    const res = await fetch(url);

    if (!res.ok) {
      console.error("API ERROR:", res.status, url);
      return null;
    }

    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      console.error("NOT JSON:", text.slice(0, 200));
      return null;
    }
  } catch (e) {
    console.error("FETCH FAILED:", e);
    return null;
  }
}

// ===== FETCH BOOKS =====
export async function fetchBooks(translation: string) {
  if (!translation) return [];

  const data = await safeFetch(
    `${API_URL}/bible/get-books/${translation}`
  );

  if (!Array.isArray(data)) {
    console.error("BOOKS NOT ARRAY:", data);
    return [];
  }

  return data;
}

// ===== FETCH CHAPTERS =====
export async function fetchChapters(
  bookId: string,
  translation: string
) {
  const books = await fetchBooks(translation);

  if (!Array.isArray(books) || books.length === 0) {
    return [];
  }

  const currentBook = books.find((b: any) => b?.id === bookId);

  if (!currentBook || typeof currentBook.chapters !== "number") {
    console.error("BOOK NOT FOUND:", bookId);
    return [];
  }

  return Array.from(
    { length: currentBook.chapters },
    (_, i) => i + 1
  );
}

// ===== FETCH FULL CHAPTER =====
export async function fetchFullChapter(
  book: string,
  chapter: number,
  translation: string
) {
  if (!translation) return [];

  const data = await safeFetch(
    `${API_URL}/bible/get-text/${encodeURIComponent(
      translation
    )}/${book}/${chapter}`
  );

  if (!Array.isArray(data)) {
    console.error("CHAPTER NOT ARRAY:", data);
    return [];
  }

  return data;
}

// ===== FETCH TRANSLATIONS =====
export async function fetchTranslations() {
  const data = await safeFetch(
    `${API_URL}/bible/get-languages`
  );

  if (!Array.isArray(data)) {
    console.error("TRANSLATIONS NOT ARRAY:", data);
    return [];
  }

  return data.flatMap((lang: any) =>
    (lang?.translations || []).map((t: any) => ({
      short_name: t?.short_name || "unknown",
      full_name: t?.full_name || "unknown",
      language: lang?.language || "unknown",
      updated: t?.updated || 0,
    }))
  );
}