const PROXY_URL = "/api/bibleProxy";

// ===== UNIVERSAL SAFE FETCH =====
async function safeFetch(url: string) {
  try {
    const res = await fetch(url);

    if (!res.ok) {
      console.error("API ERROR:", res.status, url);
      return null;
    }

    const data = await res.json();
    return data;
  } catch (e) {
    console.error("FETCH FAILED:", url, e);
    return null;
  }
}

// ===== FETCH BOOKS =====
export async function fetchBooks(translation: string) {
  const data = await safeFetch(
    `${PROXY_URL}/bible/get-books/${translation}`
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
    console.error("BOOKS EMPTY");
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
  const data = await safeFetch(
    `${PROXY_URL}/bible/get-text/${encodeURIComponent(
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
    `${PROXY_URL}/bible/get-languages`
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