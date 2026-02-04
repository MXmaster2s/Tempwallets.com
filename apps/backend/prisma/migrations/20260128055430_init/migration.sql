-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "googleId" TEXT,
    "fingerprint" TEXT,
    "name" TEXT,
    "picture" TEXT,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "encryptedSeed" TEXT NOT NULL,
    "encryptedEntropy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WalletAddress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletAddress_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WalletSeed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "wallet_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "wallet_cache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL,
    "cachedBalances" JSONB NOT NULL,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "wallet_address_cache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "aptos_account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL DEFAULT 0,
    "network" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "aptos_account_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "eip7702_delegation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "walletId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "delegationAddress" TEXT NOT NULL,
    "authorizedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
    "transactionAlerts" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "dateFormat" TEXT NOT NULL DEFAULT 'MM/DD/YYYY',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "language" TEXT NOT NULL DEFAULT 'en',
    "analyticsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dataSharing" BOOLEAN NOT NULL DEFAULT false,
    "autoLockMinutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "deviceName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "lastActiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payment_channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    CONSTRAINT "payment_channel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lightning_node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "appSessionId" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "maxParticipants" INTEGER NOT NULL DEFAULT 10,
    "quorum" INTEGER NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'NitroRPC/0.4',
    "challenge" INTEGER NOT NULL DEFAULT 3600,
    "sessionData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "closedAt" DATETIME,
    CONSTRAINT "lightning_node_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lightning_node_participant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lightningNodeId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "balance" TEXT NOT NULL DEFAULT '0',
    "asset" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "joinedAt" DATETIME,
    "lastSeenAt" DATETIME,
    "leftAt" DATETIME,
    CONSTRAINT "lightning_node_participant_lightningNodeId_fkey" FOREIGN KEY ("lightningNodeId") REFERENCES "lightning_node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lightning_node_transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lightningNodeId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "intent" TEXT,
    "txHash" TEXT,
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lightning_node_transaction_lightningNodeId_fkey" FOREIGN KEY ("lightningNodeId") REFERENCES "lightning_node" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "wc_session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "pairingTopic" TEXT,
    "dappName" TEXT,
    "dappDescription" TEXT,
    "dappUrl" TEXT,
    "dappIcon" TEXT,
    "namespaces" JSONB NOT NULL,
    "expiry" DATETIME NOT NULL,
    "relay" JSONB NOT NULL,
    "eip7702Only" BOOLEAN NOT NULL DEFAULT true,
    "approvedChains" TEXT NOT NULL,
    "approvedAccounts" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "wc_proposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "proposalId" BIGINT NOT NULL,
    "proposerName" TEXT,
    "proposerUrl" TEXT,
    "proposerIcon" TEXT,
    "requiredChains" TEXT NOT NULL,
    "requiredMethods" TEXT NOT NULL,
    "requiredEvents" TEXT NOT NULL,
    "optionalChains" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    "rejectionReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "wc_request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "requestId" BIGINT NOT NULL,
    "topic" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "chainId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "response" JSONB,
    "error" TEXT,
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    "usedEip7702" BOOLEAN NOT NULL DEFAULT false,
    "gasSponsored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "wc_request_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "wc_session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "user_preferences_userId_idx" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "user_activity_userId_idx" ON "user_activity"("userId");

-- CreateIndex
CREATE INDEX "user_activity_userId_createdAt_idx" ON "user_activity"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_activity_type_idx" ON "user_activity"("type");

-- CreateIndex
CREATE INDEX "user_session_userId_idx" ON "user_session"("userId");

-- CreateIndex
CREATE INDEX "user_session_userId_lastActiveAt_idx" ON "user_session"("userId", "lastActiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_channel_channelId_key" ON "payment_channel"("channelId");

-- CreateIndex
CREATE INDEX "payment_channel_userId_idx" ON "payment_channel"("userId");

-- CreateIndex
CREATE INDEX "payment_channel_channelId_idx" ON "payment_channel"("channelId");

-- CreateIndex
CREATE INDEX "payment_channel_status_idx" ON "payment_channel"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_channel_userId_chainId_key" ON "payment_channel"("userId", "chainId");

-- CreateIndex
CREATE UNIQUE INDEX "lightning_node_appSessionId_key" ON "lightning_node"("appSessionId");

-- CreateIndex
CREATE INDEX "lightning_node_userId_idx" ON "lightning_node"("userId");

-- CreateIndex
CREATE INDEX "lightning_node_appSessionId_idx" ON "lightning_node"("appSessionId");

-- CreateIndex
CREATE INDEX "lightning_node_status_idx" ON "lightning_node"("status");

-- CreateIndex
CREATE INDEX "lightning_node_createdAt_idx" ON "lightning_node"("createdAt");

-- CreateIndex
CREATE INDEX "lightning_node_participant_lightningNodeId_idx" ON "lightning_node_participant"("lightningNodeId");

-- CreateIndex
CREATE INDEX "lightning_node_participant_address_idx" ON "lightning_node_participant"("address");

-- CreateIndex
CREATE UNIQUE INDEX "lightning_node_participant_lightningNodeId_address_asset_key" ON "lightning_node_participant"("lightningNodeId", "address", "asset");

-- CreateIndex
CREATE INDEX "lightning_node_transaction_lightningNodeId_idx" ON "lightning_node_transaction"("lightningNodeId");

-- CreateIndex
CREATE INDEX "lightning_node_transaction_from_idx" ON "lightning_node_transaction"("from");

-- CreateIndex
CREATE INDEX "lightning_node_transaction_to_idx" ON "lightning_node_transaction"("to");

-- CreateIndex
CREATE INDEX "lightning_node_transaction_type_idx" ON "lightning_node_transaction"("type");

-- CreateIndex
CREATE INDEX "lightning_node_transaction_status_idx" ON "lightning_node_transaction"("status");

-- CreateIndex
CREATE INDEX "lightning_node_transaction_createdAt_idx" ON "lightning_node_transaction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "wc_session_topic_key" ON "wc_session"("topic");

-- CreateIndex
CREATE INDEX "wc_session_userId_idx" ON "wc_session"("userId");

-- CreateIndex
CREATE INDEX "wc_session_topic_idx" ON "wc_session"("topic");

-- CreateIndex
CREATE INDEX "wc_session_expiry_idx" ON "wc_session"("expiry");

-- CreateIndex
CREATE INDEX "wc_proposal_userId_idx" ON "wc_proposal"("userId");

-- CreateIndex
CREATE INDEX "wc_proposal_proposalId_idx" ON "wc_proposal"("proposalId");

-- CreateIndex
CREATE INDEX "wc_proposal_status_idx" ON "wc_proposal"("status");

-- CreateIndex
CREATE INDEX "wc_request_sessionId_idx" ON "wc_request"("sessionId");

-- CreateIndex
CREATE INDEX "wc_request_topic_idx" ON "wc_request"("topic");

-- CreateIndex
CREATE INDEX "wc_request_status_idx" ON "wc_request"("status");
