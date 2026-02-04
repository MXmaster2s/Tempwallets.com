-- AlterTable
ALTER TABLE "User" ADD COLUMN     "walletExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WalletSeed" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "WalletSeed_expiresAt_idx" ON "WalletSeed"("expiresAt");
