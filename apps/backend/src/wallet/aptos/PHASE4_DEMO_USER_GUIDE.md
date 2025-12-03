# Phase 4 Testing Guide - Demo User

Quick testing guide using `demo-user-123`.

## Quick Start

### 1. Start Server

```bash
cd apps/backend
pnpm dev
```

### 2. Run Quick Test Script

```bash
./test-phase4-demo.sh
```

This script will:
- ✅ Check if wallet exists (create if needed)
- ✅ Get Aptos address
- ✅ Check balance
- ✅ Fund from faucet if balance is 0
- ✅ Verify addresses in wallet list

---

## Manual Testing Commands

### Create/Verify Wallet

```bash
# Create wallet (if doesn't exist)
curl -X POST http://localhost:5005/wallet/seed \
  -H "Content-Type: application/json" \
  -d '{"userId": "demo-user-123", "mode": "random"}'
```

### Get Aptos Address

```bash
# Mainnet
curl "http://localhost:5005/wallet/aptos/address?userId=demo-user-123&network=mainnet" | jq '.'

# Devnet (for testing)
curl "http://localhost:5005/wallet/aptos/address?userId=demo-user-123&network=devnet" | jq '.'
```

### Get Balance

```bash
curl "http://localhost:5005/wallet/aptos/balance?userId=demo-user-123&network=devnet" | jq '.'
```

### Fund from Faucet (Devnet)

```bash
curl -X POST http://localhost:5005/wallet/aptos/faucet \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "demo-user-123",
    "network": "devnet",
    "amount": 100
  }' | jq '.'
```

### Send APT (After Funding)

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

### Verify in Wallet List

```bash
curl "http://localhost:5005/wallet/addresses?userId=demo-user-123" | jq '.auxiliary[] | select(.chain | startswith("aptos"))'
```

---

## Expected Results

### Address Format
- ✅ Starts with `0x`
- ✅ 66 characters (0x + 64 hex)
- ✅ Lowercase
- ✅ Same address for all networks

### Wallet List
Should show 4 Aptos entries:
- `aptos` - Aptos
- `aptosMainnet` - Aptos Mainnet
- `aptosTestnet` - Aptos Testnet
- `aptosDevnet` - Aptos Devnet

All with the same address.

---

## Troubleshooting

### "No wallet seed found"
Run the create wallet command first.

### "Faucet request failed"
- Ensure network is `devnet` or `testnet` (not `mainnet`)
- Check faucet URL in environment variables
- Wait a few seconds and retry

### "Transaction simulation failed"
- Check balance first
- Verify recipient address format
- Ensure sufficient balance for gas fees

---

## Full Testing Guide

For detailed instructions, see: `PHASE4_TESTING_GUIDE.md`

