export type BibleBook = {
  name: string;
  chapters: string[][];
};

export type Verse = {
  VerseId: number;
  Text: string;
};

export type Chapter = {
  ChapterId: number;
  Verses: Verse[];
};

export type Book = {
  BookId: number;
  BookName: string;
  Chapters: Chapter[];
};

export type BibleData = {
  Translation: string;
  Books: Book[];
};