const PROXY_URL = "/api/bibleProxy";

// ===== FETCH BOOKS =====
export async function fetchBooks(translation: string) {
  try {
    const res = await fetch(
      `${PROXY_URL}/bible/get-books/${translation}`
    );

    if (!res.ok) {
      console.error("BOOKS API ERROR:", res.status);
      return [];
    }

    const data = await res.json();

    if (!Array.isArray(data)) {
      console.error("BOOKS NOT ARRAY:", data);
      return [];
    }

    return data;
  } catch (e) {
    console.error("BOOKS FETCH FAILED:", e);
    return [];
  }
}

// ===== FETCH CHAPTERS =====
export async function fetchChapters(
  bookId: string,
  translation: string
) {
  try {
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
  } catch (e) {
    console.error("CHAPTERS ERROR:", e);
    return [];
  }
}

// ===== FETCH FULL CHAPTER =====
export async function fetchFullChapter(
  book: string,
  chapter: number,
  translation: string
) {
  try {
    const res = await fetch(
      `${PROXY_URL}/bible/get-text/${encodeURIComponent(
        translation
      )}/${book}/${chapter}`
    );

    if (!res.ok) {
      console.error("CHAPTER API ERROR:", res.status);
      return [];
    }

    const data = await res.json();

    if (!Array.isArray(data)) {
      console.error("CHAPTER NOT ARRAY:", data);
      return [];
    }

    return data;
  } catch (e) {
    console.error("CHAPTER FETCH FAILED:", e);
    return [];
  }
}

// ===== FETCH TRANSLATIONS =====
export async function fetchTranslations() {
  try {
    const res = await fetch(
      `${PROXY_URL}/bible/get-languages`
    );

    if (!res.ok) {
      console.error("TRANSLATIONS API ERROR:", res.status);
      return [];
    }

    const data = await res.json();

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
  } catch (e) {
    console.error("TRANSLATIONS FETCH FAILED:", e);
    return [];
  }
}