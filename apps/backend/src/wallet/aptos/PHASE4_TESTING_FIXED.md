# Phase 4 Testing - Fixed Issues

## ✅ Issues Fixed

### 1. Balance Endpoint
**Fixed:** Removed `@Body()` from GET endpoint - now uses query parameters only.

### 2. Faucet Service  
**Fixed:** Now uses Aptos SDK's `fundAccount()` method instead of raw HTTP calls.

---

## Quick Test Commands (demo-user-123)

### 1. Start Server
```bash
cd apps/backend
pnpm dev
```

### 2. Get Balance (Fixed)
```bash
curl "http://localhost:5005/wallet/aptos/balance?userId=demo-user-123&network=devnet" | jq '.'
```

**Expected Response:**
```json
{
  "balance": "0.00000000",
  "network": "devnet",
  "currency": "APT"
}
```

### 3. Fund from Faucet (Fixed)
```bash
curl -X POST http://localhost:5005/wallet/aptos/faucet \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "demo-user-123",
    "network": "devnet",
    "amount": 100
  }' | jq '.'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Successfully funded account with 100 APT",
  "transactionHash": "0x...",
  "address": "0x..."
}
```

### 4. Verify Balance After Funding
```bash
# Wait 5-10 seconds for transaction to confirm
sleep 10
curl "http://localhost:5005/wallet/aptos/balance?userId=demo-user-123&network=devnet" | jq '.'
```

**Expected Response:**
```json
{
  "balance": "100.00000000",
  "network": "devnet",
  "currency": "APT"
}
```

### 5. Send APT
```bash
curl -X POST http://localhost:5005/wallet/aptos/send \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "demo-user-123",
    "recipientAddress": "0x0000000000000000000000000000000000000000000000000000000000000001",
    "amount": "0.1",
    "network": "devnet"
  }' | jq '.'
```

**Expected Response:**
```json
{
  "success": true,
  "transactionHash": "0x...",
  "sequenceNumber": 0
}
```

---

## Run Automated Test

```bash
./test-phase4-demo.sh
```

This script will:
1. Check/create wallet for demo-user-123
2. Get address
3. Get balance
4. Fund from faucet (if balance is 0)
5. Verify addresses in wallet list

---

## Troubleshooting

### If balance endpoint still fails:
- Ensure `userId` is in query string: `?userId=demo-user-123`
- Check server logs for errors

### If faucet fails:
- Ensure network is `devnet` or `testnet` (not `mainnet`)
- Check SDK version: `pnpm list @aptos-labs/ts-sdk`
- Check server logs for detailed error

### If send fails:
- Ensure account has balance (use faucet first)
- Check recipient address format (must be 0x + 64 hex)
- Verify transaction on explorer

---

## All Fixed! ✅

Both issues resolved:
- ✅ Balance endpoint uses query params
- ✅ Faucet uses SDK's fundAccount method

Ready to test!

