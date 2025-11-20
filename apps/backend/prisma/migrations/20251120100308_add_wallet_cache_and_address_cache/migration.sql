-- CreateTable
CREATE TABLE "wallet_cache" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "cachedBalances" JSONB NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_address_cache" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_address_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_cache_fingerprint_key" ON "wallet_cache"("fingerprint");

-- CreateIndex
CREATE INDEX "wallet_cache_fingerprint_idx" ON "wallet_cache"("fingerprint");

-- CreateIndex
CREATE INDEX "wallet_address_cache_fingerprint_idx" ON "wallet_address_cache"("fingerprint");

-- CreateIndex
CREATE INDEX "wallet_address_cache_chain_idx" ON "wallet_address_cache"("chain");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_address_cache_fingerprint_chain_key" ON "wallet_address_cache"("fingerprint", "chain");
