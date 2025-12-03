# Phase 4 Testing Guide

Complete guide for testing Aptos wallet API endpoints.

## Prerequisites

1. **Backend built and ready:**
   ```bash
   cd apps/backend
   pnpm build
   ```

2. **Environment variables configured:**
   - Check `APTOS_ENV_SETUP.md` for required variables
   - Ensure `.env` file has Aptos RPC URLs configured

3. **Database running:**
   - PostgreSQL database accessible
   - Prisma migrations applied

---

## Step 1: Start the Server

### Start Development Server

```bash
cd apps/backend
pnpm dev
```

**Expected Output:**
```
🚀 Application is running on: http://localhost:5005
📊 Health check available at: http://localhost:5005/health
```

### Verify Server is Running

```bash
curl http://localhost:5005/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-29T..."
}
```

---

## Step 2: Create or Import a Wallet

Before testing Aptos endpoints, you need a wallet with a seed phrase.

### Option A: Create New Wallet (Random Seed)

```bash
curl -X POST http://localhost:5005/wallet/seed \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-aptos-001",
    "mode": "random"
  }'
```

**Expected Response:**
```json
{
  "ok": true
}
```

### Option B: Import Existing Wallet (Known Seed)

```bash
curl -X POST http://localhost:5005/wallet/seed \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-aptos-001",
    "mode": "mnemonic",
    "mnemonic": "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
  }'
```

**Note:** The test mnemonic above is for testing only. Never use in production!

---

## Step 3: Test Get Address Endpoint

### Get Aptos Address (Mainnet)

```bash
curl -X GET "http://localhost:5005/wallet/aptos/address?userId=test-user-aptos-001&network=mainnet" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "address": "0xeb663b681209e7087d681c5d3eed12aaa8e1915e7c87794542c3f96e94b3d3bf",
  "network": "mainnet",
  "accountIndex": 0
}
```

### Get Aptos Address (Testnet)

```bash
curl -X GET "http://localhost:5005/wallet/aptos/address?userId=test-user-aptos-001&network=testnet" \
  -H "Content-Type: application/json"
```

### Get Aptos Address (Devnet)

```bash
curl -X GET "http://localhost:5005/wallet/aptos/address?userId=test-user-aptos-001&network=devnet" \
  -H "Content-Type: application/json"
```

### Get Address with Account Index

```bash
curl -X GET "http://localhost:5005/wallet/aptos/address?userId=test-user-aptos-001&network=mainnet&accountIndex=1" \
  -H "Content-Type: application/json"
```

**Expected:** Different address for account index 1

### Verify Address Format

The address should:
- ✅ Start with `0x`
- ✅ Be 66 characters long (0x + 64 hex chars)
- ✅ Be lowercase
- ✅ Be the same across all networks (mainnet/testnet/devnet use same address)

---

## Step 4: Test Get Balance Endpoint

### Get APT Balance (Mainnet)

```bash
curl -X GET "http://localhost:5005/wallet/aptos/balance?userId=test-user-aptos-001&network=mainnet" \
  -H "Content-Type: application/json"
```

**Expected Response (if account has balance):**
```json
{
  "balance": "0.00000000",
  "network": "mainnet",
  "currency": "APT"
}
```

**Expected Response (if account doesn't exist on-chain):**
```json
{
  "balance": "0.00000000",
  "network": "mainnet",
  "currency": "APT"
}
```

**Note:** New accounts will show 0 balance until funded.

### Get Balance (Testnet/Devnet)

```bash
# Testnet
curl -X GET "http://localhost:5005/wallet/aptos/balance?userId=test-user-aptos-001&network=testnet" \
  -H "Content-Type: application/json"

# Devnet
curl -X GET "http://localhost:5005/wallet/aptos/balance?userId=test-user-aptos-001&network=devnet" \
  -H "Content-Type: application/json"
```

---

## Step 5: Fund Test Account (Faucet)

**⚠️ Important:** Faucet only works on testnet and devnet, NOT mainnet.

### Fund Account on Devnet

```bash
curl -X POST http://localhost:5005/wallet/aptos/faucet \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-aptos-001",
    "network": "devnet",
    "amount": 100
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Successfully funded account with 100 APT",
  "transactionHash": "0x...",
  "address": "0xeb663b681209e7087d681c5d3eed12aaa8e1915e7c87794542c3f96e94b3d3bf"
}
```

### Fund Account on Testnet

```bash
curl -X POST http://localhost:5005/wallet/aptos/faucet \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-aptos-001",
    "network": "testnet",
    "amount": 100
  }'
```

### Verify Balance After Funding

Wait a few seconds for the transaction to confirm, then check balance:

```bash
curl -X GET "http://localhost:5005/wallet/aptos/balance?userId=test-user-aptos-001&network=devnet" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "balance": "100.00000000",
  "network": "devnet",
  "currency": "APT"
}
```

### Faucet Error Cases

**Test mainnet (should fail):**
```bash
curl -X POST http://localhost:5005/wallet/aptos/faucet \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-aptos-001",
    "network": "mainnet",
    "amount": 100
  }'
```

**Expected Error:**
```json
{
  "statusCode": 400,
  "message": "network must be \"testnet\" or \"devnet\" (faucet not available for mainnet)"
}
```

---

## Step 6: Test Send APT Endpoint

**⚠️ Important:** You need a funded account to test sending. Use the faucet first!

### Send APT on Devnet

First, get your address and a recipient address:

```bash
# Get your address
YOUR_ADDRESS=$(curl -s "http://localhost:5005/wallet/aptos/address?userId=test-user-aptos-001&network=devnet" | jq -r '.address')

# Use a known test address (0x1 is the Aptos framework account)
RECIPIENT="0x0000000000000000000000000000000000000000000000000000000000000001"

# Send 0.1 APT
curl -X POST http://localhost:5005/wallet/aptos/send \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"test-user-aptos-001\",
    \"recipientAddress\": \"$RECIPIENT\",
    \"amount\": \"0.1\",
    \"network\": \"devnet\"
  }"
```

**Expected Response:**
```json
{
  "success": true,
  "transactionHash": "0x...",
  "sequenceNumber": 0
}
```

### Verify Transaction

1. **Check transaction on explorer:**
   - Devnet: https://explorer.aptoslabs.com/?network=devnet
   - Paste the transaction hash from the response

2. **Check balance after transaction:**
   ```bash
   curl -X GET "http://localhost:5005/wallet/aptos/balance?userId=test-user-aptos-001&network=devnet" \
     -H "Content-Type: application/json"
   ```

### Send APT Error Cases

**Test with invalid address:**
```bash
curl -X POST http://localhost:5005/wallet/aptos/send \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-aptos-001",
    "recipientAddress": "invalid-address",
    "amount": "0.1",
    "network": "devnet"
  }'
```

**Expected Error:**
```json
{
  "statusCode": 400,
  "message": ["Recipient address must be a valid Aptos address (0x + 1-64 hex chars)"]
}
```

**Test with negative amount:**
```bash
curl -X POST http://localhost:5005/wallet/aptos/send \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-aptos-001",
    "recipientAddress": "0x1",
    "amount": "-1",
    "network": "devnet"
  }'
```

**Expected Error:**
```json
{
  "statusCode": 400,
  "message": "Amount must be a positive number"
}
```

**Test with insufficient balance:**
```bash
curl -X POST http://localhost:5005/wallet/aptos/send \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-aptos-001",
    "recipientAddress": "0x1",
    "amount": "1000000",
    "network": "devnet"
  }'
```

**Expected Error:**
```json
{
  "statusCode": 500,
  "message": "Transaction simulation failed: ..."
}
```

---

## Step 7: Test Wallet Addresses Endpoint

Verify Aptos addresses appear in the main wallet addresses endpoint:

```bash
curl -X GET "http://localhost:5005/wallet/addresses?userId=test-user-aptos-001" \
  -H "Content-Type: application/json"
```

**Expected Response (should include Aptos addresses):**
```json
{
  "smartAccount": { ... },
  "auxiliary": [
    {
      "key": "ethereum",
      "label": "Ethereum (EOA)",
      "chain": "ethereum",
      "address": "0x...",
      "category": "evm"
    },
    {
      "key": "aptos",
      "label": "Aptos",
      "chain": "aptos",
      "address": "0xeb663b681209e7087d681c5d3eed12aaa8e1915e7c87794542c3f96e94b3d3bf",
      "category": "aptos"
    },
    {
      "key": "aptosMainnet",
      "label": "Aptos Mainnet",
      "chain": "aptosMainnet",
      "address": "0xeb663b681209e7087d681c5d3eed12aaa8e1915e7c87794542c3f96e94b3d3bf",
      "category": "aptos"
    },
    {
      "key": "aptosTestnet",
      "label": "Aptos Testnet",
      "chain": "aptosTestnet",
      "address": "0xeb663b681209e7087d681c5d3eed12aaa8e1915e7c87794542c3f96e94b3d3bf",
      "category": "aptos"
    },
    {
      "key": "aptosDevnet",
      "label": "Aptos Devnet",
      "chain": "aptosDevnet",
      "address": "0xeb663b681209e7087d681c5d3eed12aaa8e1915e7c87794542c3f96e94b3d3bf",
      "category": "aptos"
    }
  ]
}
```

**Verify:**
- ✅ All 4 Aptos addresses present (aptos, aptosMainnet, aptosTestnet, aptosDevnet)
- ✅ All have same address (expected - same address for all networks)
- ✅ Category is "aptos"
- ✅ Labels are correct

---

## Step 8: Test Concurrent Transactions

Test sequence number locking by sending multiple transactions concurrently:

```bash
# Send 3 transactions in parallel
for i in {1..3}; do
  curl -X POST http://localhost:5005/wallet/aptos/send \
    -H "Content-Type: application/json" \
    -d "{
      \"userId\": \"test-user-aptos-001\",
      \"recipientAddress\": \"0x1\",
      \"amount\": \"0.01\",
      \"network\": \"devnet\"
    }" &
done
wait
```

**Expected Behavior:**
- ✅ All transactions should succeed (no sequence number collisions)
- ✅ Each transaction gets a unique sequence number
- ✅ No "sequence number too old" errors

**Verify:**
- Check transaction hashes on explorer
- All should have different sequence numbers
- All should be successful

---

## Step 9: Test Authentication

### Test with JWT Token (if using authentication)

```bash
# Get token from your auth endpoint
TOKEN="your-jwt-token-here"

# Test authenticated request
curl -X GET "http://localhost:5005/wallet/aptos/address?network=mainnet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN"
```

### Test without Authentication (should work with userId in query)

```bash
curl -X GET "http://localhost:5005/wallet/aptos/address?userId=test-user-aptos-001&network=mainnet" \
  -H "Content-Type: application/json"
```

---

## Step 10: Complete Test Flow

### Full End-to-End Test Script

```bash
#!/bin/bash

# Configuration
USER_ID="test-user-aptos-$(date +%s)"
BASE_URL="http://localhost:5005"
NETWORK="devnet"

echo "🧪 Phase 4 Complete Test Flow"
echo "================================"
echo ""

# Step 1: Create wallet
echo "1. Creating wallet..."
curl -X POST "$BASE_URL/wallet/seed" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"mode\": \"random\"
  }" | jq '.'
echo ""

# Step 2: Get address
echo "2. Getting Aptos address..."
ADDRESS=$(curl -s "$BASE_URL/wallet/aptos/address?userId=$USER_ID&network=$NETWORK" | jq -r '.address')
echo "   Address: $ADDRESS"
echo ""

# Step 3: Check initial balance
echo "3. Checking initial balance..."
curl -s "$BASE_URL/wallet/aptos/balance?userId=$USER_ID&network=$NETWORK" | jq '.'
echo ""

# Step 4: Fund from faucet
echo "4. Funding account from faucet..."
curl -X POST "$BASE_URL/wallet/aptos/faucet" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"network\": \"$NETWORK\",
    \"amount\": 100
  }" | jq '.'
echo ""

# Wait for transaction to confirm
echo "5. Waiting 5 seconds for transaction to confirm..."
sleep 5
echo ""

# Step 5: Check balance after funding
echo "6. Checking balance after funding..."
curl -s "$BASE_URL/wallet/aptos/balance?userId=$USER_ID&network=$NETWORK" | jq '.'
echo ""

# Step 6: Send APT
echo "7. Sending 0.1 APT..."
TX_RESULT=$(curl -s -X POST "$BASE_URL/wallet/aptos/send" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"recipientAddress\": \"0x0000000000000000000000000000000000000000000000000000000000000001\",
    \"amount\": \"0.1\",
    \"network\": \"$NETWORK\"
  }")
echo "$TX_RESULT" | jq '.'
TX_HASH=$(echo "$TX_RESULT" | jq -r '.transactionHash')
echo "   Transaction Hash: $TX_HASH"
echo ""

# Step 7: Verify in explorer
echo "8. Verify transaction:"
echo "   https://explorer.aptoslabs.com/?network=$NETWORK&transaction=$TX_HASH"
echo ""

# Step 8: Check final balance
echo "9. Checking final balance..."
sleep 3
curl -s "$BASE_URL/wallet/aptos/balance?userId=$USER_ID&network=$NETWORK" | jq '.'
echo ""

echo "✅ Test flow complete!"
```

**Save as `test-phase4-complete.sh` and run:**
```bash
chmod +x test-phase4-complete.sh
./test-phase4-complete.sh
```

---

## Testing Checklist

### Basic Functionality
- [ ] Server starts without errors
- [ ] Health check endpoint works
- [ ] Can create/import wallet
- [ ] Can get Aptos address
- [ ] Address format is correct (0x + 64 hex, lowercase)
- [ ] Same address for all networks (mainnet/testnet/devnet)

### Balance & Faucet
- [ ] Can get balance (returns 0 for new accounts)
- [ ] Can fund account from faucet (devnet)
- [ ] Can fund account from faucet (testnet)
- [ ] Faucet rejects mainnet requests
- [ ] Balance updates after faucet funding

### Transactions
- [ ] Can send APT on devnet
- [ ] Transaction hash returned
- [ ] Transaction appears on explorer
- [ ] Balance decreases after sending
- [ ] Sequence number increments correctly

### Error Handling
- [ ] Invalid address format rejected
- [ ] Negative amounts rejected
- [ ] Insufficient balance detected
- [ ] Invalid network rejected
- [ ] Missing userId handled

### Integration
- [ ] Aptos addresses appear in `/wallet/addresses`
- [ ] All 4 Aptos networks included
- [ ] Category set to "aptos"
- [ ] Labels are correct

### Concurrency
- [ ] Multiple concurrent transactions succeed
- [ ] No sequence number collisions
- [ ] All transactions get unique sequence numbers

---

## Troubleshooting

### Issue: "No wallet seed found"
**Solution:** Create wallet first using `/wallet/seed` endpoint

### Issue: "Transaction simulation failed"
**Possible Causes:**
- Insufficient balance
- Invalid recipient address
- Network RPC issues

**Solution:**
- Check balance first
- Verify recipient address format
- Check RPC endpoint status

### Issue: "Faucet request failed"
**Possible Causes:**
- Network not testnet/devnet
- Faucet service down
- Rate limiting

**Solution:**
- Use devnet or testnet only
- Check faucet URL in environment variables
- Wait and retry

### Issue: "Cannot find module" errors
**Solution:**
```bash
cd apps/backend
pnpm build
```

### Issue: Address not appearing in `/wallet/addresses`
**Solution:**
- Clear cache: Delete address cache in database
- Regenerate addresses: Call `/wallet/addresses` again
- Check logs for errors

---

## Postman Collection

### Import into Postman

Create a Postman collection with these requests:

1. **Create Wallet**
   - Method: POST
   - URL: `http://localhost:5005/wallet/seed`
   - Body: `{ "userId": "{{userId}}", "mode": "random" }`

2. **Get Aptos Address**
   - Method: GET
   - URL: `http://localhost:5005/wallet/aptos/address?userId={{userId}}&network=devnet`

3. **Get Balance**
   - Method: GET
   - URL: `http://localhost:5005/wallet/aptos/balance?userId={{userId}}&network=devnet`

4. **Fund from Faucet**
   - Method: POST
   - URL: `http://localhost:5005/wallet/aptos/faucet`
   - Body: `{ "userId": "{{userId}}", "network": "devnet", "amount": 100 }`

5. **Send APT**
   - Method: POST
   - URL: `http://localhost:5005/wallet/aptos/send`
   - Body: `{ "userId": "{{userId}}", "recipientAddress": "0x1", "amount": "0.1", "network": "devnet" }`

**Variables:**
- `userId`: Set to your test user ID
- `baseUrl`: `http://localhost:5005`

---

## Expected Test Results

### Successful Test Run

```
✅ Server starts successfully
✅ Wallet created
✅ Address retrieved: 0x... (66 chars, lowercase)
✅ Balance retrieved: 0.00000000 APT
✅ Faucet funding successful: 100 APT
✅ Balance after funding: 100.00000000 APT
✅ Transaction sent: Hash 0x...
✅ Transaction confirmed on explorer
✅ Balance after send: 99.90000000 APT
✅ Aptos addresses appear in /wallet/addresses
✅ All endpoints return expected responses
```

---

## Next Steps After Testing

1. **Production Readiness:**
   - Test on testnet before mainnet
   - Verify error handling
   - Test rate limiting
   - Monitor logs for issues

2. **Performance Testing:**
   - Test concurrent requests
   - Test with high load
   - Monitor RPC connection pooling

3. **Security Review:**
   - Verify private keys never logged
   - Check authentication/authorization
   - Review input validation

---

## Summary

This guide covers:
- ✅ Starting the server
- ✅ Testing all API endpoints
- ✅ Funding test accounts
- ✅ Sending transactions
- ✅ Error handling
- ✅ Integration verification

**Ready to test!** 🚀

