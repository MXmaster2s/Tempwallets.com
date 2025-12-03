#!/bin/bash

# Phase 4 Complete Test Flow
# Tests all Aptos wallet endpoints end-to-end

# Configuration
# Use demo-user-123 or generate a new one
USER_ID="${1:-demo-user-123}"
BASE_URL="http://localhost:5005"
NETWORK="${2:-testnet}"

echo "🧪 Phase 4 Complete Test Flow"
echo "================================"
echo "User ID: $USER_ID"
echo "Network: $NETWORK"
echo ""

# Step 1: Create wallet
echo "1. Creating wallet..."
CREATE_RESULT=$(curl -s -X POST "$BASE_URL/wallet/seed" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"mode\": \"random\"
  }")
echo "$CREATE_RESULT" | jq '.'
if [ "$(echo "$CREATE_RESULT" | jq -r '.ok')" != "true" ]; then
  echo "❌ Failed to create wallet"
  exit 1
fi
echo ""

# Step 2: Get address
echo "2. Getting Aptos address..."
ADDRESS_RESULT=$(curl -s "$BASE_URL/wallet/aptos/address?userId=$USER_ID&network=$NETWORK")
echo "$ADDRESS_RESULT" | jq '.'
ADDRESS=$(echo "$ADDRESS_RESULT" | jq -r '.address')
if [ "$ADDRESS" == "null" ] || [ -z "$ADDRESS" ]; then
  echo "❌ Failed to get address"
  exit 1
fi
echo "   ✅ Address: $ADDRESS"
echo ""

# Step 3: Check initial balance
echo "3. Checking initial balance..."
BALANCE_RESULT=$(curl -s "$BASE_URL/wallet/aptos/balance?userId=$USER_ID&network=$NETWORK")
echo "$BALANCE_RESULT" | jq '.'
echo ""

# Step 4: Fund from faucet
echo "4. Funding account from faucet..."
FAUCET_RESULT=$(curl -s -X POST "$BASE_URL/wallet/aptos/faucet" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"network\": \"$NETWORK\",
    \"amount\": 100
  }")
echo "$FAUCET_RESULT" | jq '.'
if [ "$(echo "$FAUCET_RESULT" | jq -r '.success')" != "true" ]; then
  echo "⚠️  Faucet funding failed (may need to retry)"
else
  TX_HASH=$(echo "$FAUCET_RESULT" | jq -r '.transactionHash')
  echo "   ✅ Transaction Hash: $TX_HASH"
fi
echo ""

# Wait for transaction to confirm
echo "5. Waiting 10 seconds for transaction to confirm..."
sleep 10
echo ""

# Step 5: Check balance after funding
echo "6. Checking balance after funding..."
BALANCE_AFTER=$(curl -s "$BASE_URL/wallet/aptos/balance?userId=$USER_ID&network=$NETWORK")
echo "$BALANCE_AFTER" | jq '.'
BALANCE=$(echo "$BALANCE_AFTER" | jq -r '.balance')
echo "   Balance: $BALANCE APT"
echo ""

# Step 6: Send APT (only if balance > 0)
BALANCE_NUM=$(echo "$BALANCE" | awk '{print int($1)}')
if [ "$BALANCE_NUM" -gt 0 ]; then
  echo "7. Sending 0.1 APT..."
  SEND_RESULT=$(curl -s -X POST "$BASE_URL/wallet/aptos/send" \
    -H "Content-Type: application/json" \
    -d "{
      \"userId\": \"$USER_ID\",
      \"recipientAddress\": \"0x0000000000000000000000000000000000000000000000000000000000000001\",
      \"amount\": \"0.1\",
      \"network\": \"$NETWORK\"
    }")
  echo "$SEND_RESULT" | jq '.'
  if [ "$(echo "$SEND_RESULT" | jq -r '.success')" == "true" ]; then
    TX_HASH=$(echo "$SEND_RESULT" | jq -r '.transactionHash')
    echo "   ✅ Transaction Hash: $TX_HASH"
    echo "   📊 View on explorer: https://explorer.aptoslabs.com/?network=$NETWORK&transaction=$TX_HASH"
  else
    echo "   ⚠️  Transaction failed"
  fi
  echo ""
  
  # Step 7: Check final balance
  echo "8. Waiting 5 seconds, then checking final balance..."
  sleep 5
  FINAL_BALANCE=$(curl -s "$BASE_URL/wallet/aptos/balance?userId=$USER_ID&network=$NETWORK")
  echo "$FINAL_BALANCE" | jq '.'
  echo ""
else
  echo "7. ⚠️  Skipping send test (insufficient balance)"
  echo ""
fi

# Step 8: Verify addresses in main endpoint
echo "9. Verifying Aptos addresses in /wallet/addresses..."
ADDRESSES_RESULT=$(curl -s "$BASE_URL/wallet/addresses?userId=$USER_ID")
APTOS_COUNT=$(echo "$ADDRESSES_RESULT" | jq '[.auxiliary[] | select(.chain | startswith("aptos"))] | length')
echo "   Found $APTOS_COUNT Aptos addresses in wallet list"
if [ "$APTOS_COUNT" -ge 4 ]; then
  echo "   ✅ All Aptos networks present"
else
  echo "   ⚠️  Expected 4 Aptos addresses"
fi
echo ""

echo "✅ Test flow complete!"
echo ""
echo "Summary:"
echo "  User ID: $USER_ID"
echo "  Address: $ADDRESS"
echo "  Network: $NETWORK"
echo "  Final Balance: $(echo "$FINAL_BALANCE" | jq -r '.balance // "N/A"') APT"

