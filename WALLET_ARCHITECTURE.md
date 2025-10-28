# Wallet Architecture - Multi-Chain Implementation

## Overview

Your wallet system creates **ONE wallet** that works across **4 blockchain networks** (Ethereum, Base, Arbitrum, Avalanche) using the same mnemonic.

## How It Works

### 1. **Single Mnemonic, Multiple Chains**
- When a user creates a wallet, one mnemonic is generated
- This same mnemonic derives addresses for ALL supported chains
- Addresses are different per chain due to different derivation paths, but all controlled by the same private key

### 2. **Database Schema**

```
User
  └── Wallet (stores encrypted mnemonic)
       ├── WalletAddress (ethereum: 0x123...)
       ├── WalletAddress (base: 0x456...)
       ├── WalletAddress (arbitrum: 0x789...)
       └── WalletAddress (avalanche: 0xabc...)
```

### 3. **Why Different Wallet Instances During Creation?**

During wallet creation, we instantiate a wallet for **each chain** to:
1. Derive the chain-specific address
2. Store those addresses in the database
3. Dispose of instances after use (security)

**For transactions**, we create ONE instance for the specific chain the user wants to interact with.

## Key Methods

### `createWallet(userId, passkey)`
- Generates mnemonic
- Encrypts with passkey
- Derives addresses for ALL 4 chains
- Stores everything in database
- Returns all addresses

### `getWalletInstanceForChain(walletId, passkey, chain)`
- Creates wallet instance for SPECIFIC chain
- Used for transactions
- Disposes after transaction

### `getWalletAddresses(walletId)`
- Returns all addresses for user (all chains)

## Environment Variables

Configure in `apps/backend/.env`:

```env
# Ethereum
ETH_BUNDLER_URL="..."
ETH_PAYMASTER_URL="..."
ETH_PAYMASTER_ADDRESS="0x..."
ETH_RPC_URL="..."

# Base
BASE_BUNDLER_URL="..."
BASE_PAYMASTER_URL="..."
BASE_PAYMASTER_ADDRESS="0x..."
BASE_RPC_URL="..."

# Arbitrum  
ARB_BUNDLER_URL="..."
ARB_PAYMASTER_URL="..."
ARB_PAYMASTER_ADDRESS="0x..."
ARB_RPC_URL="..."

# Avalanche
AVA_BUNDLER_URL="..."
AVA_PAYMASTER_URL="..."
AVA_PAYMASTER_ADDRESS="0x..."
AVA_RPC_URL="..."
```

## Next Steps

1. Configure `.env` with real RPC URLs and paymaster addresses
2. Run `npx prisma migrate dev` to create database tables
3. Test wallet creation via POST `/wallets/create`
4. Test address retrieval via GET `/wallets/:id/addresses`
