-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "bio" VARCHAR(500);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PinnedMessage" (
    "id" TEXT NOT NULL,
    "roomId" UUID NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pinnedByUserId" TEXT NOT NULL,

    CONSTRAINT "PinnedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PinnedMessage_roomId_messageId_key" ON "PinnedMessage"("roomId", "messageId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PinnedMessage_roomId_idx" ON "PinnedMessage"("roomId");

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "PinnedMessage" ADD CONSTRAINT "PinnedMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "PinnedMessage" ADD CONSTRAINT "PinnedMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "PinnedMessage" ADD CONSTRAINT "PinnedMessage_pinnedByUserId_fkey" FOREIGN KEY ("pinnedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
