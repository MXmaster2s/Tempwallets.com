#!/bin/bash

# Phase 4 Test Script for demo-user-123
# Quick test script using the demo user

# Configuration
USER_ID="demo-user-123"
BASE_URL="http://localhost:5005"
NETWORK="testnet"

echo "🧪 Phase 4 Test for: $USER_ID"
echo "================================"
echo ""

# Check if server is running
echo "Checking server status..."
if ! curl -s "$BASE_URL/health" > /dev/null; then
  echo "❌ Server is not running!"
  echo "   Start server with: pnpm dev"
  exit 1
fi
echo "✅ Server is running"
echo ""

# Step 1: Check if wallet exists, create if not
echo "1. Checking wallet..."
HAS_SEED=$(curl -s "$BASE_URL/wallet/addresses?userId=$USER_ID" 2>/dev/null | jq -r '.auxiliary[0].address // empty')
if [ -z "$HAS_SEED" ]; then
  echo "   Creating new wallet..."
  curl -X POST "$BASE_URL/wallet/seed" \
    -H "Content-Type: application/json" \
    -d "{
      \"userId\": \"$USER_ID\",
      \"mode\": \"random\"
    }" | jq '.'
  echo ""
  echo "   Waiting 2 seconds..."
  sleep 2
else
  echo "   ✅ Wallet already exists"
fi
echo ""

# Step 2: Get Aptos address
echo "2. Getting Aptos address..."
ADDRESS_RESULT=$(curl -s "$BASE_URL/wallet/aptos/address?userId=$USER_ID&network=$NETWORK")
ADDRESS=$(echo "$ADDRESS_RESULT" | jq -r '.address')
echo "$ADDRESS_RESULT" | jq '.'
echo "   Address: $ADDRESS"
echo ""

# Step 3: Get balance
echo "3. Getting balance..."
BALANCE_RESULT=$(curl -s "$BASE_URL/wallet/aptos/balance?userId=$USER_ID&network=$NETWORK")
if echo "$BALANCE_RESULT" | jq -e '.balance' > /dev/null 2>&1; then
  echo "$BALANCE_RESULT" | jq '.'
  BALANCE=$(echo "$BALANCE_RESULT" | jq -r '.balance')
  echo "   Current Balance: $BALANCE APT"
else
  echo "   ⚠️  Error getting balance:"
  echo "$BALANCE_RESULT" | jq '.'
  BALANCE="0"
fi
echo ""

# Step 4: Fund from faucet (if balance is 0 or error)
BALANCE_NUM=$(echo "$BALANCE" | awk '{print int($1 * 100000000)}' 2>/dev/null || echo "0")
if [ "$BALANCE_NUM" -eq 0 ] || [ -z "$BALANCE" ]; then
  echo "4. Funding account from faucet..."
  FAUCET_RESULT=$(curl -s -X POST "$BASE_URL/wallet/aptos/faucet" \
    -H "Content-Type: application/json" \
    -d "{
      \"userId\": \"$USER_ID\",
      \"network\": \"$NETWORK\",
      \"amount\": 100
    }")
  echo "$FAUCET_RESULT" | jq '.'
  
  if [ "$(echo "$FAUCET_RESULT" | jq -r '.success')" == "true" ]; then
    TX_HASH=$(echo "$FAUCET_RESULT" | jq -r '.transactionHash')
    echo "   ✅ Funded! Transaction: $TX_HASH"
    echo "   Waiting 10 seconds for confirmation..."
    sleep 10
    
    # Check balance again
    BALANCE_AFTER=$(curl -s "$BASE_URL/wallet/aptos/balance?userId=$USER_ID&network=$NETWORK")
    echo "$BALANCE_AFTER" | jq '.'
  else
    echo "   ⚠️  Faucet funding failed"
  fi
else
  echo "4. ✅ Account already has balance, skipping faucet"
fi
echo ""

# Step 5: Show all Aptos addresses in wallet
echo "5. Verifying Aptos addresses in wallet list..."
ADDRESSES_RESULT=$(curl -s "$BASE_URL/wallet/addresses?userId=$USER_ID")
APTOS_ADDRESSES=$(echo "$ADDRESSES_RESULT" | jq '.auxiliary[] | select(.chain | startswith("aptos"))')
echo "$APTOS_ADDRESSES" | jq -s '.'
APTOS_COUNT=$(echo "$APTOS_ADDRESSES" | jq -s '. | length')
echo "   Found $APTOS_COUNT Aptos addresses"
echo ""

# Summary
echo "================================"
echo "✅ Test Summary"
echo "================================"
echo "User ID: $USER_ID"
echo "Network: $NETWORK"
echo "Address: $ADDRESS"
echo "Balance: $(curl -s "$BASE_URL/wallet/aptos/balance?userId=$USER_ID&network=$NETWORK" | jq -r '.balance') APT"
echo ""
echo "Next: Test sending APT with:"
echo "  curl -X POST $BASE_URL/wallet/aptos/send \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"userId\": \"$USER_ID\", \"recipientAddress\": \"0x1\", \"amount\": \"0.1\", \"network\": \"$NETWORK\"}'"

