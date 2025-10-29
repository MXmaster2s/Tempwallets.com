# Wallet API Documentation

Simple wallet management API using WDK (Wallet Development Kit) with multi-chain support.

## Overview

This API provides endpoints for managing wallet seeds and retrieving addresses/balances across multiple blockchains:
- Regular wallets: Ethereum, TRON, Bitcoin, Solana
- ERC-4337 Smart Contract Wallets: Ethereum, Base, Arbitrum, Polygon

## Prerequisites

Ensure `WALLET_ENC_KEY` environment variable is set (32-byte base64 encoded key).

Generate with:
```bash
openssl rand -base64 32
```

## Endpoints

### Create or Import Wallet Seed

Generate a random seed or import an existing mnemonic.

**POST** `/wallet/seed`

**Request Body:**
```json
{
  "userId": "user-123",
  "mode": "random"  // or "mnemonic" to import
}
```

**Request Body (Import):**
```json
{
  "userId": "user-123",
  "mode": "mnemonic",
  "mnemonic": "word1 word2 word3 ... word12"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Example:**
```bash
curl -X POST http://localhost:5005/wallet/seed \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123", "mode": "random"}'
```

---

### Get Wallet Addresses

Retrieve addresses for all supported chains.

**GET** `/wallet/addresses?userId=user-123`

**Response:**
```json
{
  "ethereum": "0x...",
  "tron": "T...",
  "bitcoin": "bc1...",
  "solana": "...",
  "ethereumErc4337": "0x...",
  "baseErc4337": "0x...",
  "arbitrumErc4337": "0x...",
  "polygonErc4337": "0x..."
}
```

**Example:**
```bash
curl http://localhost:5005/wallet/addresses?userId=user-123
```

---

### Get Balances

Retrieve native token balances for all chains.

**GET** `/wallet/balances?userId=user-123`

**Response:**
```json
[
  {"chain": "ethereum", "balance": "1000000000000000000"},
  {"chain": "tron", "balance": "50000000"},
  {"chain": "bitcoin", "balance": "0"},
  {"chain": "solana", "balance": "1000000000"},
  {"chain": "ethereumErc4337", "balance": "0"},
  {"chain": "baseErc4337", "balance": "0"},
  {"chain": "arbitrumErc4337", "balance": "0"},
  {"chain": "polygonErc4337", "balance": "0"}
]
```

**Example:**
```bash
curl http://localhost:5005/wallet/balances?userId=user-123
```

---

### Get ERC-4337 Paymaster Token Balances

Get USDT/USDC balances for gasless transactions on ERC-4337 wallets.

**GET** `/wallet/erc4337/paymaster-balances?userId=user-123`

**Response:**
```json
[
  {"chain": "Ethereum", "balance": "1000000000"},
  {"chain": "Base", "balance": "500000000"},
  {"chain": "Arbitrum", "balance": "0"},
  {"chain": "Polygon", "balance": "0"}
]
```

**Example:**
```bash
curl http://localhost:5005/wallet/erc4337/paymaster-balances?userId=user-123
```

---

## Error Responses

### 404 - Not Found
Wallet seed not found for the provided userId.
```json
{
  "statusCode": 404,
  "message": "No wallet seed found for user user-123"
}
```

### 400 - Bad Request
Invalid request (e.g., invalid mnemonic format).
```json
{
  "statusCode": 400,
  "message": "Mnemonic must be 12 or 24 words"
}
```

---

## Usage Flow

1. **Create Wallet** (or import existing):
   ```bash
   POST /wallet/seed
   {
     "userId": "my-user-id",
     "mode": "random"
   }
   ```

2. **Get Addresses**:
   ```bash
   GET /wallet/addresses?userId=my-user-id
   ```

3. **Get Balances**:
   ```bash
   GET /wallet/balances?userId=my-user-id
   ```

4. **Get Paymaster Balances** (for ERC-4337):
   ```bash
   GET /wallet/erc4337/paymaster-balances?userId=my-user-id
   ```

---

## Security Notes

- Seed phrases are encrypted server-side using AES-256-GCM
- Encryption key must be stored securely in environment variables
- Never log or expose plaintext mnemonics
- Use HTTPS in production
- Rotate encryption keys periodically

---

## Supported Chains

### Regular Wallets
- **Ethereum**: Mainnet
- **TRON**: Mainnet
- **Bitcoin**: Mainnet
- **Solana**: Mainnet

### ERC-4337 Smart Contract Wallets
- **Ethereum**: Chain ID 1 (USDT)
- **Base**: Chain ID 8453 (USDC)
- **Arbitrum**: Chain ID 42161 (USDT)
- **Polygon**: Chain ID 137 (USDT)

Each ERC-4337 chain has a different Smart Wallet address but uses the same seed phrase.

