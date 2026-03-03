import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { VersesService } from './verses.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('verses')
@UseGuards(JwtAuthGuard)
export class VersesController {
  constructor(private versesService: VersesService) {}

  @Post('save')
  saveVerse(
    @Req() req,
    @Body() dto: {
      book: string;
      chapter: number;
      verse: number;
      text: string;
      translation: string;
    },
  ) {
    const userId = req.user.id;
    return this.versesService.saveVerse(
      userId,
      dto.book,
      dto.chapter,
      dto.verse,
      dto.text,
      dto.translation,
    );
  }

  @Get('saved')
  getUserSavedVerses(@Req() req) {
    const userId = req.user.id;
    return this.versesService.getUserSavedVerses(userId);
  }

  @Get('saved/book/:book')
  getSavedVersesByBook(@Req() req, @Param('book') book: string) {
    const userId = req.user.id;
    return this.versesService.getSavedVersesByBook(userId, book);
  }

  @Get('saved/check')
  checkVerseSaved(
    @Req() req,
    @Query() query: {
      book: string;
      chapter: string;
      verse: string;
      translation: string;
    },
  ) {
    const userId = req.user.id;
    return this.versesService.isVerseSaved(
      userId,
      query.book,
      parseInt(query.chapter),
      parseInt(query.verse),
      query.translation,
    );
  }

  @Delete(':verseId')
  deleteSavedVerse(@Req() req, @Param('verseId') verseId: string) {
    const userId = req.user.id;
    return this.versesService.deleteSavedVerse(userId, verseId);
  }
}
