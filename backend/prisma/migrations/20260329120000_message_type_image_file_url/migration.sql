-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'VOICE', 'IMAGE', 'FILE');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "type" "MessageType" NOT NULL DEFAULT 'TEXT';
ALTER TABLE "Message" ADD COLUMN "fileUrl" TEXT;
ALTER TABLE "Message" ALTER COLUMN "content" DROP NOT NULL;

-- Голосовые по маркеру в content
UPDATE "Message" SET "type" = 'VOICE' WHERE "content" IS NOT NULL AND "content" LIKE '[[voice:%';
