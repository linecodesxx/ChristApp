"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Verse from "@/components/Verse/Verse"
import { fetchChapters, fetchBooks, fetchFullChapter, fetchTranslations } from "@/lib/bibleApi"
import styles from "./BibleReader.module.scss"
import Image from "next/image"

type VerseType = {
  verseId: number
  text: string
}

type ModalStep = "testament" | "books" | "chapters"
const SHOW_VERSE_ACTIONS = true

export default function BibleReader() {
  const [books, setBooks] = useState<string[]>([])
  const [chapters, setChapters] = useState<number[]>([])
  const [translations, setTranslations] = useState<string[]>([])
  const [translation, setTranslation] = useState("NRT")

  const [currentBook, setCurrentBook] = useState<string | null>(null)
  const [currentChapter, setCurrentChapter] = useState(1)
  const [verses, setVerses] = useState<VerseType[]>([])

  const [highlights, setHighlights] = useState<Set<number>>(new Set())

  const [isSelectorOpen, setIsSelectorOpen] = useState(false)
  const [modalStep, setModalStep] = useState<ModalStep>("testament")
  const [selectedTestament, setSelectedTestament] = useState<"old" | "new">("old")

  const touchStartX = useRef(0)

  // ===== LOAD CHAPTER =====
  const loadChapter = useCallback(async (book: string | null, chapter: number) => {
    if (!book) {
      console.error("Book is undefined")
      return
    }

    try {
      const versesData = await fetchFullChapter(book, chapter, translation)

      setVerses(versesData)
      setCurrentBook(book)
      setCurrentChapter(chapter)

      localStorage.setItem("lastRead", JSON.stringify({ book, chapter }))

      window.scrollTo({ top: 0, behavior: "smooth" })
    } catch (err) {
      console.error("Failed to load chapter", err)
    }
  }, [translation])

  // ===== INIT =====
  useEffect(() => {
    async function init() {
      const [translationsData, booksData] = await Promise.all([fetchTranslations(), fetchBooks(translation)])

      setTranslations(translationsData)
      setBooks(booksData)

      if (!booksData || booksData.length === 0) {
        console.error("Books list is empty")
        return
      }

      const firstBook = booksData[0]
      const firstBookChapters = await fetchChapters(firstBook, translation)

      setChapters(firstBookChapters)
      await loadChapter(firstBook, 1)
    }

    init()
  }, [translation, loadChapter])

  // ===== TESTAMENT FILTER =====
  const oldTestamentBooks = books.slice(27)
  const newTestamentBooks = books.slice(0, 27)
  const testamentBooks = selectedTestament === "old" ? oldTestamentBooks : newTestamentBooks

  // ===== NAVIGATION =====
  const goNext = () => {
    if (!currentBook) return
    loadChapter(currentBook, currentChapter + 1)
  }

  const goPrev = () => {
    if (!currentBook || currentChapter <= 1) return
    loadChapter(currentBook, currentChapter - 1)
  }

  // ===== HIGHLIGHT =====
  const handleVerseClick = (v: number) => {
    setHighlights((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  }

  // ===== TOUCH =====
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientX - touchStartX.current
    if (diff > 70) goPrev()
    if (diff < -70) goNext()
  }

  if (!currentBook) {
    return <div>Loading...</div>
  }

  return (
    <main className={styles.main} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* HEADER */}
      <div className={styles.headerBar}>
        <h2 className={styles.clickable} onClick={() => setIsSelectorOpen(true)}>
          {currentBook} {currentChapter}
        </h2>

        <select value={translation} onChange={(e) => setTranslation(e.target.value)}>
          {translations.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* MODAL */}
      {isSelectorOpen && (
        <div className={styles.modalBackdrop} onClick={() => setIsSelectorOpen(false)}>
          <div className={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <button
                className={styles.backButton}
                onClick={() => {
                  if (modalStep === "books") setModalStep("testament")
                  else if (modalStep === "chapters") setModalStep("books")
                }}
                disabled={modalStep === "testament"}
              >
                ← Назад
              </button>

              <button className={styles.closeModalButton} onClick={() => setIsSelectorOpen(false)}>
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
                      setSelectedTestament("old")
                      setModalStep("books")
                    }}
                  >
                    Ветхий Завет
                  </button>

                  <button
                    className={`${styles.testamentButton} ${selectedTestament === "old" ? styles.active : ""}`}
                    onClick={() => {
                      setSelectedTestament("new")
                      setModalStep("books")
                    }}
                  >
                    Новый Завет
                  </button>
                </div>
              </div>
            )}

            {modalStep === "books" && (
              <div className={styles.modalBody}>
                <h3>{selectedTestament === "old" ? "Ветхий Завет" : "Новый Завет"}</h3>
                <div className={styles.booksList}>
                  {testamentBooks.map((book) => (
                    <button
                      className={`${styles.bookButton} ${currentBook === book ? styles.active : ""}`}
                      key={book}
                      onClick={async () => {
                        setCurrentBook(book)
                        try {
                          const selectedBookChapters = await fetchChapters(book, translation)
                          setChapters(selectedBookChapters)
                        } catch (err) {
                          console.error("Failed to fetch chapters", err)
                          setChapters([])
                        }
                        setModalStep("chapters")
                      }}
                    >
                      {book}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {modalStep === "chapters" && (
              <div className={styles.modalBody}>
                <h3>{currentBook}</h3>
                <div className={styles.chaptersList}>
                  {chapters.map((chap) => (
                    <button
                      type="button"
                      className={`${styles.chapterButton} ${currentChapter === chap ? styles.active : ""}`}
                      key={chap}
                      onClick={() => {
                        loadChapter(currentBook, chap)
                        setIsSelectorOpen(false)
                        setModalStep("testament")
                      }}
                    >
                      {chap}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FLOATING NAV */}
      <div className={styles.floatingNavLeft}>
        <button aria-label="previous chapter" onClick={goPrev} className={styles.navButton}>
          <Image src="/icon-arrow-left.svg" alt="Previous Chapter" width={24} height={24} />
        </button>
      </div>

      <div className={styles.floatingNavRight}>
        <button aria-label="next chapter" onClick={goNext} className={styles.navButton}>
          <Image src="/icon-arrow-right.svg" alt="Next Chapter" width={24} height={24} />
        </button>
      </div>

      {/* VERSES */}
      <section className={styles.versesSection}>
        {verses.map((v) => (
          <Verse
            key={v.verseId}
            verse={v.verseId}
            text={v.text}
            selected={highlights.has(v.verseId)}
            onVerseClick={handleVerseClick}
            bookName={currentBook}
            chapter={currentChapter}
            translation={translation}
            id={`verse-${v.verseId}`}
            showInlineActions={SHOW_VERSE_ACTIONS}
          />
        ))}
      </section>
    </main>
  )
}
