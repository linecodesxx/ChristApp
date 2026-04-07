-- Message.voiceDuration (голосовые сообщения)
ALTER TABLE "Message" ADD COLUMN "voiceDuration" DOUBLE PRECISION;

-- Кто прослушал голосовое
CREATE TABLE "VoiceMessageListen" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceMessageListen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VoiceMessageListen_messageId_userId_key" ON "VoiceMessageListen"("messageId", "userId");

CREATE INDEX "VoiceMessageListen_messageId_idx" ON "VoiceMessageListen"("messageId");

CREATE INDEX "VoiceMessageListen_userId_idx" ON "VoiceMessageListen"("userId");

ALTER TABLE "VoiceMessageListen" ADD CONSTRAINT "VoiceMessageListen_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VoiceMessageListen" ADD CONSTRAINT "VoiceMessageListen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
