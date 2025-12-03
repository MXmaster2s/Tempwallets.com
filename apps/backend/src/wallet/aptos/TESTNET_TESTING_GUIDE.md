# Aptos Testnet Testing Guide

This guide provides step-by-step instructions for testing the Aptos wallet integration on **testnet**.

## ✅ Configuration Updated

All default networks have been migrated from `devnet`/`mainnet` to `testnet`:
- `AptosManager` defaults: `testnet`
- `AptosWalletController` defaults: `testnet`
- Test scripts: `testnet`

## Prerequisites

1. **Server Running**: Ensure backend is running on `http://localhost:5005`
   ```bash
   cd apps/backend
   pnpm dev
   ```

2. **Environment Variables**: Ensure testnet RPC is configured (defaults are fine)
   ```env
   APTOS_TESTNET_RPC_URLS=https://fullnode.testnet.aptoslabs.com/v1
   APTOS_TESTNET_FAUCET_URL=https://faucet.testnet.aptoslabs.com
   ```

3. **Test User**: Use `demo-user-123` or create a new user

## Test Flow

### Step 1: Get Aptos Address (Testnet)

```bash
curl "http://localhost:5005/wallet/aptos/address?userId=demo-user-123&network=testnet"
```

**Expected Response:**
```json
{
  "address": "0x...",
  "network": "testnet",
  "accountIndex": 0
}
```

### Step 2: Check Balance (Testnet)

```bash
curl "http://localhost:5005/wallet/aptos/balance?userId=demo-user-123&network=testnet"
```

**Expected Response:**
```json
{
  "balance": "0.00000000",
  "network": "testnet",
  "currency": "APT"
}
```

### Step 3: Fund from Faucet (Testnet)

```bash
curl -X POST http://localhost:5005/wallet/aptos/faucet \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "demo-user-123",
    "network": "testnet",
    "amount": 100
  }'
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

**Note:** Testnet faucet may take 10-30 seconds to process. Wait before checking balance.

### Step 4: Verify Balance After Funding

```bash
curl "http://localhost:5005/wallet/aptos/balance?userId=demo-user-123&network=testnet"
```

**Expected Response:**
```json
{
  "balance": "100.00000000",
  "network": "testnet",
  "currency": "APT"
}
```

### Step 5: Send APT (Testnet)

```bash
curl -X POST http://localhost:5005/wallet/aptos/send \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "demo-user-123",
    "recipientAddress": "0x1",
    "amount": 0.1,
    "network": "testnet"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "transactionHash": "0x...",
  "sequenceNumber": 0
}
```

### Step 6: Verify Transaction on Explorer

View your transaction on Aptos Testnet Explorer:
```
https://explorer.aptoslabs.com/?network=testnet&transaction=<TRANSACTION_HASH>
```

### Step 7: Check Final Balance

```bash
curl "http://localhost:5005/wallet/aptos/balance?userId=demo-user-123&network=testnet"
```

**Expected:** ~99.9 APT (100 - 0.1 - gas fees)

## Automated Test Script

Use the provided test script:

```bash
cd apps/backend
chmod +x test-phase4-demo.sh
./test-phase4-demo.sh
```

Or with custom user/network:

```bash
./test-phase4-complete.sh demo-user-123 testnet
```

## Testnet vs Devnet Differences

| Feature | Testnet | Devnet |
|---------|---------|--------|
| **Stability** | More stable | Less stable |
| **Reset Frequency** | Rarely resets | May reset |
| **Faucet Speed** | 10-30 seconds | Usually faster |
| **Network Load** | Higher | Lower |
| **Production-like** | ✅ Yes | ❌ No |

## Common Issues

### 1. Faucet Timeout
**Issue:** Faucet request times out or takes too long
**Solution:** Wait 30-60 seconds and check balance. Testnet faucet can be slower than devnet.

### 2. Transaction Pending
**Issue:** Transaction submitted but not confirmed
**Solution:** Wait up to 30 seconds. Testnet can have higher latency than devnet.

### 3. RPC Rate Limiting
**Issue:** Too many requests to RPC endpoint
**Solution:** The RPC service has retry logic and failover. If issues persist, check environment variables.

### 4. Balance Not Updating
**Issue:** Balance shows 0 after faucet funding
**Solution:** 
- Wait 30-60 seconds for testnet confirmation
- Check transaction hash on explorer
- Verify network parameter is `testnet`

## Verification Checklist

- [ ] Address retrieved successfully
- [ ] Balance query works
- [ ] Faucet funding successful (100 APT)
- [ ] Balance updated after funding
- [ ] Transaction sent successfully
- [ ] Transaction visible on explorer
- [ ] Final balance correct (after gas fees)

## Next Steps

After successful testnet testing:
1. ✅ All endpoints working
2. ✅ Transactions confirmed
3. ✅ Ready for Phase 5 (Frontend Integration)

## Testnet Explorer

- **Main Explorer**: https://explorer.aptoslabs.com/?network=testnet
- **Alternative**: https://aptoscan.com/?network=testnet

## Support

If you encounter issues:
1. Check server logs: `pnpm dev` output
2. Verify environment variables
3. Check transaction on explorer
4. Ensure network parameter is `testnet` (not `devnet` or `mainnet`)

