export type BibleBook = {
  name: string;
  chapters: string[][];
};

export type BibleData = {
  books: BibleBook[];
};