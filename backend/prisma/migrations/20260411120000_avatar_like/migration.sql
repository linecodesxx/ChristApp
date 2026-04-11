-- CreateTable
CREATE TABLE "AvatarLike" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "likerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvatarLike_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvatarLike_targetUserId_likerUserId_key" ON "AvatarLike"("targetUserId", "likerUserId");

-- CreateIndex
CREATE INDEX "AvatarLike_targetUserId_idx" ON "AvatarLike"("targetUserId");

-- AddForeignKey
ALTER TABLE "AvatarLike" ADD CONSTRAINT "AvatarLike_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvatarLike" ADD CONSTRAINT "AvatarLike_likerUserId_fkey" FOREIGN KEY ("likerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
