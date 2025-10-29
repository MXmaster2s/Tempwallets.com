# Wallet API Integration Setup Guide

This guide explains how to configure the wallet creation API with the dashboard to load and display wallets dynamically.

## 🚀 Quick Start

### 1. Environment Setup

Create a `.env` file in the root directory with the following variables:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:5005

# Backend Configuration
PORT=5005
ETH_RPC_URL=https://eth.drpc.org
TRON_RPC_URL=https://api.trongrid.io
BTC_RPC_URL=https://go.getblock.io/8d88a97b63bd4b0f9184780aa7a62061
SOL_RPC_URL=https://api.mainnet-beta.solana.com

# ERC-4337 Configuration (optional - uses defaults if not set)
ETH_ERC4337_RPC_URL=https://rpc.mevblocker.io/fast
ETH_BUNDLER_URL=https://api.candide.dev/public/v3/ethereum
ETH_PAYMASTER_URL=https://api.candide.dev/public/v3/ethereum
ETH_PAYMASTER_ADDRESS=0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba
ENTRY_POINT_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032
SAFE_MODULES_VERSION=0.3.0
ETH_PAYMASTER_TOKEN=0xdAC17F958D2ee523a2206206994597C13D831ec7
TRANSFER_MAX_FEE=100000000000000
```

### 2. Start the Servers

**Backend Server:**
```bash
cd apps/backend
npm run dev
```
The backend will start on port 5005.

**Frontend Server:**
```bash
cd apps/web
npm run dev
```
The frontend will start on port 3000.

### 3. Test the Integration

Run the test script to verify everything is working:
```bash
node test-wallet-api.js
```

## 📁 Files Created/Modified

### New Files:
- `apps/web/lib/api.ts` - API utility functions
- `apps/web/hooks/useWallet.ts` - Custom React hook for wallet management
- `test-wallet-api.js` - Test script for API integration

### Modified Files:
- `apps/web/components/dashboard/wallet-info.tsx` - Updated to use real API data

## 🔧 API Endpoints

The wallet service provides the following endpoints:

### POST `/wallet/seed`
Create or import a wallet seed phrase.

**Request Body:**
```json
{
  "userId": "user-123",
  "mode": "random" | "mnemonic",
  "mnemonic": "optional mnemonic phrase"
}
```

### GET `/wallet/addresses?userId={userId}`
Get all wallet addresses for all supported chains.

**Response:**
```json
{
  "ethereum": "0x...",
  "tron": "T...",
  "bitcoin": "1...",
  "solana": "...",
  "ethereumErc4337": "0x...",
  "baseErc4337": "0x...",
  "arbitrumErc4337": "0x...",
  "polygonErc4337": "0x..."
}
```

### GET `/wallet/balances?userId={userId}`
Get balances for all chains.

**Response:**
```json
[
  { "chain": "ethereum", "balance": "0" },
  { "chain": "tron", "balance": "0" },
  { "chain": "bitcoin", "balance": "0" },
  { "chain": "solana", "balance": "0" }
]
```

### GET `/wallet/erc4337/paymaster-balances?userId={userId}`
Get ERC-4337 paymaster token balances.

## 🎨 UI Features

The updated wallet-info component now includes:

### Automatic Wallet Creation
- Wallets are automatically created when users first visit the dashboard
- No manual "Create Wallet" button needed - seamless user experience
- Supports all blockchain networks (Ethereum, Bitcoin, Solana, Tron, ERC-4337 chains)

### Simplified UI
- Clean wallet cards showing only wallet addresses (no balance display)
- ERC-4337 addresses are deduplicated - if multiple chains share the same address, only one card is shown
- Copy-to-clipboard functionality for wallet addresses
- Responsive design maintained
- Removed refresh button for cleaner interface

### Loading States & Error Handling
- Loading spinners during API calls
- Error messages with retry options
- Graceful fallback for API failures

## 🔄 How It Works

1. **Component Mount**: When the dashboard loads, it automatically checks for existing wallets
2. **Auto-Creation**: If no wallets exist, a new wallet is automatically created with a random seed phrase
3. **Address Deduplication**: ERC-4337 addresses are checked for duplicates - if multiple chains share the same address, only one card is displayed
4. **Real-time Display**: Wallet addresses are fetched from the backend API and displayed immediately
5. **Error Recovery**: Failed requests show error messages with retry options

## 🐛 Troubleshooting

### Common Issues:

1. **CORS Errors**: Make sure the backend CORS is configured for `http://localhost:3000`
2. **API Connection Failed**: Verify the backend is running on port 5005
3. **Empty Wallets**: Check if the user has created any wallets
4. **Balance Issues**: Balances might be 0 for new wallets (this is normal)

### Debug Steps:

1. Check browser console for errors
2. Verify API endpoints with the test script
3. Check backend logs for detailed error messages
4. Ensure all environment variables are set correctly

## 🚀 Next Steps

- Implement user authentication to replace the demo userId
- Add wallet import functionality
- Implement transaction history
- Add real-time balance updates
- Implement wallet backup/restore features
