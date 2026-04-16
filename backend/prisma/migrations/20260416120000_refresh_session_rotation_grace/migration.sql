-- Grace period for concurrent refresh: keep revoked row briefly with cached access JWT.
ALTER TABLE "RefreshSession" ADD COLUMN "isRevoked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RefreshSession" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "RefreshSession" ADD COLUMN "graceAccessToken" TEXT;
