-- AlterTable
ALTER TABLE "User" ADD COLUMN "nickname" TEXT;

UPDATE "User" SET "nickname" = "username" WHERE "nickname" IS NULL;

ALTER TABLE "User" ALTER COLUMN "nickname" SET NOT NULL;
