-- CreateTable
CREATE TABLE "SavedVerse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "book" TEXT NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verse" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "translation" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedVerse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavedVerse_userId_book_chapter_verse_translation_key" ON "SavedVerse"("userId", "book", "chapter", "verse", "translation");

-- CreateIndex
CREATE INDEX "SavedVerse_userId_savedAt_idx" ON "SavedVerse"("userId", "savedAt");

-- AddForeignKey
ALTER TABLE "SavedVerse" ADD CONSTRAINT "SavedVerse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
