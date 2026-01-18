-- CreateTable
CREATE TABLE "UserAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT,
    "symbol" TEXT NOT NULL,
    "balance" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserAsset_userId_idx" ON "UserAsset"("userId");

-- CreateIndex
CREATE INDEX "UserAsset_userId_lastSyncedAt_idx" ON "UserAsset"("userId", "lastSyncedAt");

-- CreateIndex
CREATE INDEX "UserAsset_chain_idx" ON "UserAsset"("chain");

-- CreateIndex
CREATE UNIQUE INDEX "UserAsset_userId_chain_address_symbol_key" ON "UserAsset"("userId", "chain", "address", "symbol");

-- AddForeignKey
ALTER TABLE "UserAsset" ADD CONSTRAINT "UserAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
