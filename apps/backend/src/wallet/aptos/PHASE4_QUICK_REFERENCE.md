# Phase 4 Quick Reference

Quick commands for testing Aptos wallet endpoints.

## 🚀 Start Server

```bash
cd apps/backend
pnpm dev
```

## 📝 Create Wallet

```bash
curl -X POST http://localhost:5005/wallet/seed \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user", "mode": "random"}'
```

## 🔍 Get Address

```bash
# Mainnet
curl "http://localhost:5005/wallet/aptos/address?userId=test-user&network=mainnet"

# Devnet
curl "http://localhost:5005/wallet/aptos/address?userId=test-user&network=devnet"
```

## 💰 Get Balance

```bash
curl "http://localhost:5005/wallet/aptos/balance?userId=test-user&network=devnet"
```

## 🚰 Fund from Faucet (Devnet/Testnet Only)

```bash
curl -X POST http://localhost:5005/wallet/aptos/faucet \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "network": "devnet",
    "amount": 100
  }'
```

## 📤 Send APT

```bash
curl -X POST http://localhost:5005/wallet/aptos/send \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "recipientAddress": "0x1",
    "amount": "0.1",
    "network": "devnet"
  }'
```

## ✅ Verify in Wallet List

```bash
curl "http://localhost:5005/wallet/addresses?userId=test-user" | jq '.auxiliary[] | select(.chain | startswith("aptos"))'
```

## 🧪 Run Complete Test

```bash
./test-phase4-complete.sh
```

## 📊 View Transaction

After sending, view on explorer:
- Devnet: `https://explorer.aptoslabs.com/?network=devnet&transaction=TX_HASH`
- Testnet: `https://explorer.aptoslabs.com/?network=testnet&transaction=TX_HASH`
- Mainnet: `https://explorer.aptoslabs.com/?network=mainnet&transaction=TX_HASH`

## ⚠️ Common Issues

| Issue | Solution |
|-------|----------|
| "No wallet seed found" | Create wallet first |
| "Faucet not available" | Use devnet/testnet only |
| "Transaction simulation failed" | Check balance, verify address |
| "Cannot find module" | Run `pnpm build` |

## 📚 Full Guide

See `PHASE4_TESTING_GUIDE.md` for detailed instructions.

