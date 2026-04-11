-- Длина ключа `plus-jakarta-sans` — 17 символов; при VARCHAR(16) значение обрезалось и шрифт не применялся.
ALTER TABLE "User" ALTER COLUMN "themeFontKey" SET DATA TYPE VARCHAR(32);

UPDATE "User"
SET "themeFontKey" = 'plus-jakarta-sans'
WHERE "themeFontKey" = 'plus-jakarta-san';
