-- Add isActive flag to users (schema already expects it)
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Rooms
CREATE TABLE "Room" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- Seed global room used by gateway logic
INSERT INTO "Room" ("id", "title")
VALUES ('00000000-0000-0000-0000-000000000001', 'Global Chat')
ON CONFLICT ("id") DO NOTHING;

-- Add room relation for messages
ALTER TABLE "Message"
ADD COLUMN IF NOT EXISTS "roomId" UUID;

UPDATE "Message"
SET "roomId" = '00000000-0000-0000-0000-000000000001'
WHERE "roomId" IS NULL;

ALTER TABLE "Message"
ALTER COLUMN "roomId" SET NOT NULL;

ALTER TABLE "Message"
ALTER COLUMN "roomId" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- Room memberships
CREATE TABLE "RoomMember" (
    "roomId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("roomId", "userId")
);

-- Indexes
CREATE INDEX "Message_roomId_createdAt_idx" ON "Message"("roomId", "createdAt");
CREATE INDEX "RoomMember_userId_idx" ON "RoomMember"("userId");
CREATE UNIQUE INDEX "Room_title_key" ON "Room"("title");

-- Foreign keys
ALTER TABLE "Message"
ADD CONSTRAINT "Message_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RoomMember"
ADD CONSTRAINT "RoomMember_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoomMember"
ADD CONSTRAINT "RoomMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
