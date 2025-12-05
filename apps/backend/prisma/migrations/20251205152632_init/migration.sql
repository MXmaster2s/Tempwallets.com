-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "googleId" TEXT,
    "fingerprint" TEXT,
    "name" TEXT,
    "picture" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "encryptedSeed" TEXT NOT NULL,
    "encryptedEntropy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAddress" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletSeed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletSeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_history_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "aptos_account" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL DEFAULT 0,
    "network" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aptos_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eip7702_delegation" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "delegationAddress" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eip7702_delegation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_fingerprint_key" ON "User"("fingerprint");

-- CreateIndex
CREATE INDEX "User_googleId_idx" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_fingerprint_idx" ON "User"("fingerprint");

-- CreateIndex
CREATE INDEX "Wallet_userId_idx" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "WalletAddress_walletId_idx" ON "WalletAddress"("walletId");

-- CreateIndex
CREATE INDEX "WalletAddress_address_idx" ON "WalletAddress"("address");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAddress_walletId_chain_key" ON "WalletAddress"("walletId", "chain");

-- CreateIndex
CREATE UNIQUE INDEX "WalletSeed_userId_key" ON "WalletSeed"("userId");

-- CreateIndex
CREATE INDEX "WalletSeed_userId_idx" ON "WalletSeed"("userId");

-- CreateIndex
CREATE INDEX "wallet_history_userId_idx" ON "wallet_history"("userId");

-- CreateIndex
CREATE INDEX "wallet_history_userId_isActive_idx" ON "wallet_history"("userId", "isActive");

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

-- CreateIndex
CREATE INDEX "aptos_account_walletId_idx" ON "aptos_account"("walletId");

-- CreateIndex
CREATE INDEX "aptos_account_address_idx" ON "aptos_account"("address");

-- CreateIndex
CREATE UNIQUE INDEX "aptos_account_walletId_network_key" ON "aptos_account"("walletId", "network");

-- CreateIndex
CREATE UNIQUE INDEX "aptos_account_address_network_key" ON "aptos_account"("address", "network");

-- CreateIndex
CREATE INDEX "eip7702_delegation_address_chainId_idx" ON "eip7702_delegation"("address", "chainId");

-- CreateIndex
CREATE INDEX "eip7702_delegation_walletId_idx" ON "eip7702_delegation"("walletId");

-- CreateIndex
CREATE UNIQUE INDEX "eip7702_delegation_walletId_chainId_key" ON "eip7702_delegation"("walletId", "chainId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAddress" ADD CONSTRAINT "WalletAddress_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aptos_account" ADD CONSTRAINT "aptos_account_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
