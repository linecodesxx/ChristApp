import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VersesService {
  constructor(private prisma: PrismaService) {}

  // Зберегти вірш
  async saveVerse(
    userId: string,
    book: string,
    chapter: number,
    verse: number,
    text: string,
    translation: string,
  ) {
    try {
      return await this.prisma.savedVerse.create({
        data: {
          userId,
          book,
          chapter,
          verse,
          text,
          translation,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException('Этот стих уже сохранён');
      }
      throw error;
    }
  }

  // Отримати всі збережені вірші користувача
  async getUserSavedVerses(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    return this.prisma.savedVerse.findMany({
      where: { userId },
      orderBy: { savedAt: 'desc' },
    });
  }

  // Отримати збережені вірші за книгою
  async getSavedVersesByBook(userId: string, book: string) {
    return this.prisma.savedVerse.findMany({
      where: { userId, book },
      orderBy: [{ chapter: 'asc' }, { verse: 'asc' }],
    });
  }

  // Видалити збережений вірш
  async deleteSavedVerse(userId: string, verseId: string) {
    const verse = await this.prisma.savedVerse.findUnique({
      where: { id: verseId },
    });

    if (!verse) throw new NotFoundException('Стих не найден');

    if (verse.userId !== userId) {
      throw new NotFoundException('Этот стих не принадлежит пользователю');
    }

    return this.prisma.savedVerse.delete({
      where: { id: verseId },
    });
  }

  // Перевірити, чи є вірш у збережених
  async isVerseSaved(
    userId: string,
    book: string,
    chapter: number,
    verse: number,
    translation: string,
  ) {
    const savedVerse = await this.prisma.savedVerse.findUnique({
      where: {
        userId_book_chapter_verse_translation: {
          userId,
          book,
          chapter,
          verse,
          translation,
        },
      },
    });

    return !!savedVerse;
  }
}
