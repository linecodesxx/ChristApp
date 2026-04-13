"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Verse from "@/components/Verse/Verse";
import ShareToChatModal from "@/components/Verse/ShareToChatModal";
import styles from "./BibleReader.module.scss";
import Image from "next/image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  bibleBooksQueryKey,
  bibleChapterTextQueryKey,
  bibleChaptersQueryKey,
  bibleStaticQueryOptions,
  bibleTranslationsQueryKey,
  fetchBibleBooksForQuery,
  fetchBibleChapterTextForQuery,
  fetchBibleChaptersForQuery,
  fetchBibleTranslationsForQuery,
  type BibleTranslationItem,
} from "@/lib/queries/bibleQueries";
import { pickTranslationShortName } from "@/lib/bibleTranslationForLocale";
import BibleReadingSkeleton from "@/components/BibleReadingSkeleton/BibleReadingSkeleton";
import { useAuth } from "@/hooks/useAuth";
import { usePresenceSocket } from "@/components/PresenceSocket/PresenceSocket";
import { createShareTargetsFromRooms, type RoomSocketItem, type ShareTarget } from "@/lib/chatRooms";
import { clearVerseSelectionClipboard, getSelectedVersesClipboardText } from "@/components/Verse/Verse";
import { serializeVerseSharePayload } from "@/lib/verseShareMessage";
import { VERSE_HIGHLIGHT_STORAGE_KEY, isValidHighlightHex } from "@/lib/verseHighlightStorage";
import {
  BIBLE_LAST_READ_STORAGE_KEY,
  markBibleChapterCompleted,
} from "@/lib/bibleReadingProgress";

type VerseType = {
  pk: number;
  verse: number;
  text: string;
};

type BookType = {
  id: string;
  name: string;
  chapters: number;
};

type ModalStep = "testament" | "books" | "chapters";

const SHOW_VERSE_ACTIONS = true;
const SESSION_HIGHLIGHTS_KEY = "bible-reader-highlights";

function resolveLastReadBookAndChapter(
  books: BookType[],
): { book: BookType; chapter: number } | null {
  if (!books.length) return null;

  let bookToLoad = books[0];
  let chapterToLoad = 1;

  try {
    const raw = window.localStorage.getItem(BIBLE_LAST_READ_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        bookId?: string;
        chapter?: number;
      };
      const found = books.find((b) => b.id === parsed.bookId);
      if (found) bookToLoad = found;
      if (parsed.chapter) chapterToLoad = parsed.chapter;
    }
  } catch {
    // ігноруємо
  }

  const maxChapter = bookToLoad.chapters;
  if (chapterToLoad < 1 || chapterToLoad > maxChapter) chapterToLoad = 1;

  return { book: bookToLoad, chapter: chapterToLoad };
}

/** Книги з кешу RQ без очікування useQuery (важливо при remount після виходу з вкладки). */
function getCachedBooks(queryClient: QueryClient, translation: string): BookType[] {
  return queryClient.getQueryData<BookType[]>(bibleBooksQueryKey(translation)) ?? [];
}

export default function BibleReader() {
  const tChat = useTranslations("chat");
  const locale = useLocale();
  const { user, users } = useAuth();
  const { socket } = usePresenceSocket();
  const queryClient = useQueryClient();
  /** Після layout: вмикаємо запити на клієнті без зайвого кадру зі скелетом за наявності кешу. */
  const [isMounted, setIsMounted] = useState(false);

  const [translation, setTranslation] = useState("NRT");

  const [currentBook, setCurrentBook] = useState<BookType | null>(null);
  const [currentChapter, setCurrentChapter] = useState(1);

  const [highlights, setHighlights] = useState<Set<string>>(new Set());
  const [isHighlightsHydrated, setIsHighlightsHydrated] = useState(false);

  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [activeActionsVerseKey, setActiveActionsVerseKey] = useState<string | null>(null);
  const [shareTargets, setShareTargets] = useState<ShareTarget[]>([]);
  const [highlightStorageEpoch, setHighlightStorageEpoch] = useState(0);
  const [modalStep, setModalStep] = useState<ModalStep>("testament");
  const [selectedTestament, setSelectedTestament] = useState<"old" | "new">(
    "old",
  );

  const touchStartX = useRef(0);
  const versesSectionRef = useRef<HTMLDivElement | null>(null);
  const chapterReadSentinelRef = useRef<HTMLDivElement | null>(null);
  /** Щоб не перезаписувати книгу/главу при кожному новому reference `books` з useQuery. */
  const readerLayoutTranslationRef = useRef<string | null>(null);
  /** На мобільному: ховаємо нижні стрілки під час прокрутки тексту глави. */
  const [floatingNavScrolledAway, setFloatingNavScrolledAway] = useState(false);

  // ===== ЗАВАНТАЖЕННЯ ГЛАВИ =====
  const loadChapter = useCallback((book: BookType, chapter: number) => {
    setCurrentBook(book);
    setCurrentChapter(chapter);
    window.scrollTo({ top: 0, behavior: "smooth" });

    localStorage.setItem(
      BIBLE_LAST_READ_STORAGE_KEY,
      JSON.stringify({ bookId: book.id, chapter, bookName: book.name }),
    );
  }, []);

  // ===== ПІДСВІЧУВАННЯ =====
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(SESSION_HIGHLIGHTS_KEY);
      if (!raw) return setHighlights(new Set());
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return setHighlights(new Set());
      setHighlights(new Set(parsed.filter((x: any) => typeof x === "string")));
    } catch {
      setHighlights(new Set());
    } finally {
      setIsHighlightsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHighlightsHydrated || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        SESSION_HIGHLIGHTS_KEY,
        JSON.stringify(Array.from(highlights)),
      );
    } catch {}
  }, [highlights, isHighlightsHydrated]);

  const { data: translations = [] } = useQuery({
    queryKey: bibleTranslationsQueryKey,
    queryFn: fetchBibleTranslationsForQuery,
    enabled: isMounted,
    ...bibleStaticQueryOptions,
  });

  useEffect(() => {
    if (!translations.length) {
      return;
    }
    setTranslation(pickTranslationShortName(translations as BibleTranslationItem[], locale));
  }, [locale, translations]);

  const { data: books = [] } = useQuery({
    queryKey: bibleBooksQueryKey(translation),
    queryFn: () => fetchBibleBooksForQuery(translation),
    enabled: isMounted && Boolean(translation),
    ...bibleStaticQueryOptions,
  });

  /**
  * Клієнт + позиція читання до відмальовування: при поверненні з «Чатів» кеш книг уже в QueryClient,
  * а useQuery з enabled:false ще не віддав би data — без цього щоразу скелетон.
   */
  useLayoutEffect(() => {
    setIsMounted(true);

    const fromCache = getCachedBooks(queryClient, translation);
    const list = fromCache.length > 0 ? fromCache : books;
    if (!list.length) return;

    const resolved = resolveLastReadBookAndChapter(list);
    if (!resolved) return;

    const translationChanged = readerLayoutTranslationRef.current !== translation;
    readerLayoutTranslationRef.current = translation;

    if (translationChanged) {
      setCurrentBook(resolved.book);
      setCurrentChapter(resolved.chapter);
      return;
    }

    setCurrentBook((prev) => prev ?? resolved.book);
  }, [queryClient, translation, books]);

  // ===== ФІЛЬТР ЗАПОВІТУ =====
  const oldTestamentBooks = books.filter((b) => {
    // ID перших 39 книг – Старий Завіт (GEN…MAL)
    const oldIds = [
      "GEN",
      "EXO",
      "LEV",
      "NUM",
      "DEU",
      "JOS",
      "JDG",
      "RUT",
      "1SA",
      "2SA",
      "1KI",
      "2KI",
      "1CH",
      "2CH",
      "EZR",
      "NEH",
      "EST",
      "JOB",
      "PSA",
      "PRO",
      "ECC",
      "SNG",
      "ISA",
      "JER",
      "LAM",
      "EZK",
      "DAN",
      "HOS",
      "JOL",
      "AMO",
      "OBA",
      "JON",
      "MIC",
      "NAM",
      "HAB",
      "ZEP",
      "HAG",
      "ZEC",
      "MAL",
    ];
    return oldIds.includes(b.id);
  });

  const newTestamentBooks = books.filter((b) => !oldTestamentBooks.includes(b));
  const testamentBooks =
    selectedTestament === "old" ? oldTestamentBooks : newTestamentBooks;

  // ===== НАВІГАЦІЯ =====
  const isFirstChapter = currentBook ? currentChapter === 1 && oldTestamentBooks.indexOf(currentBook) === 0 : false;
  const isLastChapter = currentBook ? currentChapter === currentBook.chapters : false;
  const isLastBook = currentBook ? newTestamentBooks.indexOf(currentBook) !== -1 && currentBook.id === newTestamentBooks[newTestamentBooks.length - 1].id : false;

  const goNext = useCallback(() => {
    if (!currentBook) return;
    if (currentChapter < currentBook.chapters) {
      loadChapter(currentBook, currentChapter + 1);
    } else {
      const currentBookIndex = books.findIndex((b) => b.id === currentBook.id);
      const nextBook = books[currentBookIndex + 1];
      if (nextBook) {
        loadChapter(nextBook, 1);
      }
    }
  }, [currentBook, currentChapter, books, loadChapter]);

  const goPrev = useCallback(() => {
    if (!currentBook) return;
    if (currentChapter > 1) {
      loadChapter(currentBook, currentChapter - 1);
    } else {
      const currentBookIndex = books.findIndex((b) => b.id === currentBook.id);
      const prevBook = books[currentBookIndex - 1];
      if (prevBook) {
        loadChapter(prevBook, prevBook.chapters);
      }
    }
  }, [currentBook, currentChapter, books, loadChapter]);

  const getHighlightKey = (bookId: string, chapter: number, verse: number) =>
    `${bookId}|${chapter}|${verse}`;

  const handleVerseClick = useCallback(
    (verse: number) => {
      if (!currentBook) return;

      const key = getHighlightKey(currentBook.id, currentChapter, verse);

      setHighlights((prev) => {
        const next = new Set(prev);

        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    },
    [currentBook, currentChapter],
  );

  const requestShareTargets = useCallback(() => {
    if (!socket?.connected) {
      return;
    }
    socket.emit("getMyRooms");
  }, [socket]);

  useEffect(() => {
    if (!socket) {
      setShareTargets([]);
      return;
    }

    const onMyRooms = (payload: { rooms?: RoomSocketItem[] }) => {
      const mapped = createShareTargetsFromRooms({
        rooms: payload.rooms ?? [],
        currentUserId: user?.id,
        users: users.map((existingUser) => ({
          id: existingUser.id,
          username: existingUser.username,
          nickname: existingUser.nickname,
          avatarUrl: existingUser.avatarUrl,
        })),
        labels: {
          globalChatTitle: tChat("globalChatTitle"),
          shareWithJesusTitle: tChat("shareWithJesusTitle"),
          directChatFallback: tChat("chatFallback"),
        },
      });
      setShareTargets(mapped);
    };

    socket.on("myRooms", onMyRooms);
    return () => {
      socket.off("myRooms", onMyRooms);
    };
  }, [socket, tChat, user?.id, users]);

  const handleOpenShare = useCallback(() => {
    requestShareTargets();
    setIsShareModalOpen(true);
  }, [requestShareTargets]);

  const handleShareToTarget = useCallback(
    (target: ShareTarget): boolean => {
      if (!socket?.connected || !currentBook) {
        return false;
      }

      const lines = getSelectedVersesClipboardText().trim();
      const selectedVerseNumbers = Array.from(highlights)
        .map((key) => {
          const [bookId, chapterValue, verseValue] = key.split("|");
          if (bookId !== currentBook.id || Number(chapterValue) !== currentChapter) {
            return null;
          }
          const parsed = Number(verseValue);
          return Number.isFinite(parsed) ? parsed : null;
        })
        .filter((value): value is number => value !== null)
        .sort((left, right) => left - right);

      const fallbackVerse = (() => {
        if (!activeActionsVerseKey) return 1;
        const [, chapterValue, verseValue] = activeActionsVerseKey.split("|");
        if (Number(chapterValue) !== currentChapter) return 1;
        const parsed = Number(verseValue);
        return Number.isFinite(parsed) ? parsed : 1;
      })();

      const verses = selectedVerseNumbers.length > 0 ? selectedVerseNumbers : [fallbackVerse];
      const textToSend = lines || "Стих";
      const content = serializeVerseSharePayload({
        bookName: currentBook.name,
        chapter: currentChapter,
        verses,
        text: textToSend,
      });

      socket.emit("sendMessage", { roomId: target.roomId, content });
      return true;
    },
    [socket, currentBook, highlights, currentChapter, activeActionsVerseKey],
  );

  const handleTouchStart = (e: React.TouchEvent) =>
    (touchStartX.current = e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (diff > 70) goPrev();
    if (diff < -70) goNext();
  };

  const { data: chapters = [] } = useQuery({
    queryKey: bibleChaptersQueryKey(translation, currentBook?.id ?? ""),
    queryFn: () => fetchBibleChaptersForQuery(translation, currentBook!.id),
    enabled: isMounted && Boolean(currentBook),
    ...bibleStaticQueryOptions,
  });

  const versesQueryKey = bibleChapterTextQueryKey(
    translation,
    currentBook?.id ?? "",
    currentChapter,
  );

  const { data: verses, isLoading: versesIsLoading } = useQuery({
    queryKey: versesQueryKey,
    queryFn: () =>
      fetchBibleChapterTextForQuery(translation, currentBook!.id, currentChapter),
    enabled: isMounted && Boolean(currentBook),
    placeholderData: () => queryClient.getQueryData<VerseType[]>(versesQueryKey),
    ...bibleStaticQueryOptions,
  });

  const memomizedVerses = useMemo(() => {
    if (!currentBook || !verses) return [];

    return verses.map((v: any) => ({
      ...v,
      selected: highlights.has(
        getHighlightKey(currentBook.id, currentChapter, v.verse),
      ),
    }));
  }, [verses, highlights, currentBook, currentChapter]);

  const applyHighlightColorToSelection = useCallback(
    (color: string | null, options?: { closeToolbar?: boolean }) => {
      if (typeof window === "undefined" || !currentBook) {
        return;
      }

      const closeToolbar = options?.closeToolbar !== false;

      const rows = verses ?? [];
      if (!rows.length) {
        return;
      }

      const targetVerseNums = new Set<number>();
      for (const k of highlights) {
        const [bookId, ch, v] = k.split("|");
        if (bookId !== currentBook.id || Number(ch) !== currentChapter) {
          continue;
        }
        const n = Number(v);
        if (Number.isFinite(n)) {
          targetVerseNums.add(n);
        }
      }
      if (targetVerseNums.size === 0 && activeActionsVerseKey) {
        const parts = activeActionsVerseKey.split("|");
        if (parts.length >= 3 && Number(parts[1]) === currentChapter) {
          const n = Number(parts[2]);
          if (Number.isFinite(n)) {
            targetVerseNums.add(n);
          }
        }
      }

      try {
        const rawValue = window.localStorage.getItem(VERSE_HIGHLIGHT_STORAGE_KEY);
        const parsed = rawValue ? (JSON.parse(rawValue) as Record<string, string>) : {};

        for (const row of rows as VerseType[]) {
          if (!targetVerseNums.has(row.verse)) {
            continue;
          }
          const storageKey = `${currentBook.name}|${currentChapter}|${row.verse}|${row.text}`;
          if (color && isValidHighlightHex(color)) {
            parsed[storageKey] = color;
          } else {
            delete parsed[storageKey];
          }
        }

        window.localStorage.setItem(VERSE_HIGHLIGHT_STORAGE_KEY, JSON.stringify(parsed));
        setHighlightStorageEpoch((e) => e + 1);
        if (closeToolbar) {
          setHighlights(new Set());
          setActiveActionsVerseKey(null);
          clearVerseSelectionClipboard();
        }
      } catch {
        // ігноруємо помилки localStorage
      }
    },
    [activeActionsVerseKey, currentBook, currentChapter, verses, highlights],
  );

  const hasVersesData = verses !== undefined;

  useEffect(() => {
    if (!currentBook || (versesIsLoading && !hasVersesData)) return;
    const el = versesSectionRef.current;
    if (el) {
      el.scrollTop = 0;
    }
    setFloatingNavScrolledAway(false);
  }, [currentBook?.id, currentChapter, versesIsLoading, hasVersesData]);

  useEffect(() => {
    if (!currentBook || (versesIsLoading && !hasVersesData)) return undefined;
    const el = versesSectionRef.current;
    if (!el) return undefined;
    const threshold = 40;
    const onScroll = () => {
      const away = el.scrollTop > threshold;
      setFloatingNavScrolledAway((prev) => (prev === away ? prev : away));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [currentBook?.id, currentChapter, versesIsLoading, hasVersesData, memomizedVerses.length]);

  /** Скелетон лише без книги або при першому завантаженні тексту глави без кешу (isMounted не потрібен — layout уже підставив книгу). */
  const showReaderSkeleton =
    !currentBook || (versesIsLoading && !hasVersesData);

  /** Глава вважається прочитаною, якщо низ тексту ~2 с у зоні видимості області прокрутки глави. */
  useEffect(() => {
    if (!currentBook || (versesIsLoading && !hasVersesData)) return;

    const root = versesSectionRef.current;
    const sentinel = chapterReadSentinelRef.current;
    if (!root || !sentinel) return;

    const bookId = currentBook.id;
    const chapter = currentChapter;

    let timer: number | undefined;
    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.12);
        if (visible) {
          if (timer === undefined) {
            timer = window.setTimeout(() => {
              markBibleChapterCompleted(bookId, chapter);
              clearTimer();
            }, 2000);
          }
        } else {
          clearTimer();
        }
      },
      { root, threshold: [0, 0.12, 0.25, 0.5, 1] },
    );

    observer.observe(sentinel);
    return () => {
      clearTimer();
      observer.disconnect();
    };
  }, [currentBook, currentChapter, versesIsLoading, hasVersesData]);

  if (showReaderSkeleton) {
    return (
      <div className={styles.loadingState}>
        <BibleReadingSkeleton variant="embedded" />
      </div>
    );
  }

  return (
    <section
      className={styles.bibleReader}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* HEADER */}
      <div className={styles.headerBar}>
        <h2
          className={styles.clickable}
          onClick={() => setIsSelectorOpen(true)}
        >
          {currentBook.name} {currentChapter}
        </h2>

        <select
          value={translation}
          onChange={(e) => setTranslation(e.target.value)}
        >
          {translations.map((t) => (
            <option key={t.short_name} value={t.short_name}>
              {t.short_name} ({t.language})
            </option>
          ))}
        </select>
      </div>

      {/* MODAL */}
      {isSelectorOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setIsSelectorOpen(false)}
        >
          <div
            className={styles.modalSheet}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <button
                className={styles.backButton}
                onClick={() => {
                  if (modalStep === "books") setModalStep("testament");
                  else if (modalStep === "chapters") setModalStep("books");
                }}
                disabled={modalStep === "testament"}
              >
                ← Назад
              </button>
              <button
                className={styles.closeModalButton}
                onClick={() => setIsSelectorOpen(false)}
              >
                ✕
              </button>
            </div>

            {modalStep === "testament" && (
              <div className={styles.modalBody}>
                <h3>Выбери завет</h3>
                <div className={styles.testamentGrid}>
                  <button
                    className={`${styles.testamentButton} ${selectedTestament === "old" ? styles.active : ""}`}
                    onClick={() => {
                      setSelectedTestament("old");
                      setModalStep("books");
                    }}
                  >
                    Ветхий Завет
                  </button>

                  <button
                    className={`${styles.testamentButton} ${selectedTestament === "new" ? styles.active : ""}`}
                    onClick={() => {
                      setSelectedTestament("new");
                      setModalStep("books");
                    }}
                  >
                    Новый Завет
                  </button>
                </div>
              </div>
            )}

            {modalStep === "books" && (
              <div className={styles.modalBody}>
                <h3>
                  {selectedTestament === "old" ? "Ветхий Завет" : "Новый Завет"}
                </h3>
                <div className={styles.booksList}>
                  {testamentBooks.map((b) => (
                    <button
                      className={`${styles.bookButton} ${currentBook.id === b.id ? styles.active : ""}`}
                      key={b.id}
                      onClick={() => {
                        setCurrentBook(b);
                        setModalStep("chapters");
                      }}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {modalStep === "chapters" && (
              <div className={styles.modalBody}>
                <h3>{currentBook.name}</h3>
                <div className={styles.chaptersList}>
                  {chapters.map((c) => (
                    <button
                      type="button"
                      className={`${styles.chapterButton} ${currentChapter === c ? styles.active : ""}`}
                      key={c}
                      onClick={() => {
                        loadChapter(currentBook, c);
                        setIsSelectorOpen(false);
                        setModalStep("testament");
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FLOATING NAV: нижче 900px — fixed внизу; під час прокрутки глави з'їжджають вниз */}
      <div
        className={`${styles.floatingNavRow} ${floatingNavScrolledAway ? styles.floatingNavRowHidden : ""}`}
      >
        <div className={styles.floatingNavLeft}>
          <button
            aria-label="previous chapter"
            onClick={goPrev}
            className={styles.navButton}
            disabled={isFirstChapter}
          >
            <Image
              src="/icon-arrow-left.svg"
              alt="Previous Chapter"
              width={24}
              height={24}
            />
          </button>
        </div>
        <div className={styles.floatingNavRight}>
          <button
            aria-label="next chapter"
            onClick={goNext}
            className={styles.navButton}
            disabled={isLastBook && isLastChapter}
          >
            <Image
              src="/icon-arrow-right.svg"
              alt="Next Chapter"
              width={24}
              height={24}
            />
          </button>
        </div>
      </div>

      {/* VERSES */}
      <section ref={versesSectionRef} className={styles.versesSection}>
        <h3 className={styles.chapterHeading}>
          <span className={styles.chapterHeadingBook}>{currentBook!.name}</span>
          <span className={styles.chapterHeadingSep} aria-hidden>
            {" "}
            ·{" "}
          </span>
          <span className={styles.chapterHeadingChapter}>Глава {currentChapter}</span>
        </h3>
        {memomizedVerses.map((v: any) => (
          <Verse
            key={v.pk}
            verse={v.verse}
            text={v.text}
            selected={v.selected}
            onVerseClick={handleVerseClick}
            bookName={currentBook!.name}
            chapter={currentChapter}
            translation={translation}
            id={`verse-${v.verse}`}
            showInlineActions={SHOW_VERSE_ACTIONS}
            activeActionsVerseKey={activeActionsVerseKey}
            onOpenActions={setActiveActionsVerseKey}
            onShareClick={handleOpenShare}
            highlightStorageEpoch={highlightStorageEpoch}
            onApplyHighlightColorToSelection={applyHighlightColorToSelection}
          />
        ))}
        <div
          ref={chapterReadSentinelRef}
          className={styles.chapterReadSentinel}
          aria-hidden
        />
      </section>
      <ShareToChatModal
        open={isShareModalOpen}
        targets={shareTargets}
        onClose={() => setIsShareModalOpen(false)}
        onSelectTarget={handleShareToTarget}
      />
    </section>
  );
}
