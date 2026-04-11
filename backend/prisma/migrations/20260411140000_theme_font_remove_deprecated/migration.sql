-- Удалены из приложения: pastah, plus-jakarta-sans, cinzel (и обрезанный ключ).
UPDATE "User"
SET "themeFontKey" = 'inter'
WHERE "themeFontKey" IS NOT NULL
  AND "themeFontKey" NOT IN ('inter', 'achiko', 'bodoni-moda');
