import { getHttpApiBase } from "@/lib/apiBase"
import { getAuthToken } from "@/lib/auth"
import { apiFetch } from "@/lib/apiFetch"

const API_URL = getHttpApiBase()

export async function saveVerse(
  book: string,
  chapter: number,
  verse: number,
  text: string,
  translation: string
) {
  const token = getAuthToken();

  if (!token) {
    throw new Error("Not authenticated");
  }

  const res = await apiFetch(`${API_URL}/verses/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      book,
      chapter,
      verse,
      text,
      translation,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to save verse");
  }

  return res.json();
}

export async function getSavedVerses() {
  const token = getAuthToken();

  if (!token) {
    return [];
  }

  try {
    const res = await apiFetch(`${API_URL}/verses/saved`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getSavedVersesByBook(book: string) {
  const token = getAuthToken();

  if (!token) {
    throw new Error("Not authenticated");
  }

  const res = await apiFetch(`${API_URL}/verses/saved/book/${encodeURIComponent(book)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch saved verses for this book");
  }

  return res.json();
}

export async function isVerseSaved(
  book: string,
  chapter: number,
  verse: number,
  translation: string
) {
  const token = getAuthToken();

  if (!token) {
    return false;
  }

  try {
    const params = new URLSearchParams({
      book,
      chapter: chapter.toString(),
      verse: verse.toString(),
      translation,
    });

    const res = await apiFetch(`${API_URL}/verses/saved/check?${params}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      return false;
    }

    const result = await res.json();
    return result;
  } catch {
    return false;
  }
}

export async function deleteSavedVerse(verseId: string) {
  const token = getAuthToken();

  if (!token) {
    throw new Error("Not authenticated");
  }

  const res = await apiFetch(`${API_URL}/verses/${verseId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to delete saved verse");
  }

  return res.json();
}
