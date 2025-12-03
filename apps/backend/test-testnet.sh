#!/bin/bash

# Quick Testnet Test Script
# Tests all Aptos endpoints on testnet

# Configuration
USER_ID="${1:-demo-user-123}"
BASE_URL="http://localhost:5005"
NETWORK="testnet"

echo "🧪 Aptos Testnet Test"
echo "===================="
echo "User ID: $USER_ID"
echo "Network: $NETWORK"
echo ""

# Check server
echo "1. Checking server..."
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
  echo "❌ Server not running! Start with: pnpm dev"
  exit 1
fi
echo "✅ Server running"
echo ""

# Get address
echo "2. Getting Aptos address..."
ADDRESS_RESULT=$(curl -s "$BASE_URL/wallet/aptos/address?userId=$USER_ID&network=$NETWORK")
ADDRESS=$(echo "$ADDRESS_RESULT" | jq -r '.address')
echo "$ADDRESS_RESULT" | jq '.'
echo "   Address: $ADDRESS"
echo ""

# Get balance
echo "3. Getting balance..."
BALANCE_RESULT=$(curl -s "$BASE_URL/wallet/aptos/balance?userId=$USER_ID&network=$NETWORK")
BALANCE=$(echo "$BALANCE_RESULT" | jq -r '.balance')
echo "$BALANCE_RESULT" | jq '.'
echo "   Balance: $BALANCE APT"
echo ""

# Fund from faucet if needed
BALANCE_NUM=$(echo "$BALANCE" | awk '{print int($1 * 100000000)}' 2>/dev/null || echo "0")
if [ "$BALANCE_NUM" -eq 0 ]; then
  echo "4. Funding from faucet (100 APT)..."
  FAUCET_RESULT=$(curl -s -X POST "$BASE_URL/wallet/aptos/faucet" \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"$USER_ID\", \"network\": \"$NETWORK\", \"amount\": 100}")
  echo "$FAUCET_RESULT" | jq '.'
  
  if [ "$(echo "$FAUCET_RESULT" | jq -r '.success')" == "true" ]; then
    TX_HASH=$(echo "$FAUCET_RESULT" | jq -r '.transactionHash')
    echo "   ✅ Funded! Hash: $TX_HASH"
    echo "   ⏳ Waiting 30 seconds for testnet confirmation..."
    sleep 30
    
    # Check balance again
    echo ""
    echo "5. Checking balance after funding..."
    BALANCE_AFTER=$(curl -s "$BASE_URL/wallet/aptos/balance?userId=$USER_ID&network=$NETWORK")
    echo "$BALANCE_AFTER" | jq '.'
  else
    echo "   ❌ Faucet failed"
  fi
else
  echo "4. ✅ Account has balance, skipping faucet"
fi
echo ""

# Send transaction
echo "6. Sending 0.1 APT to 0x1..."
SEND_RESULT=$(curl -s -X POST "$BASE_URL/wallet/aptos/send" \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$USER_ID\", \"recipientAddress\": \"0x1\", \"amount\": 0.1, \"network\": \"$NETWORK\"}")
echo "$SEND_RESULT" | jq '.'

if [ "$(echo "$SEND_RESULT" | jq -r '.success')" == "true" ]; then
  TX_HASH=$(echo "$SEND_RESULT" | jq -r '.transactionHash')
  echo "   ✅ Transaction sent! Hash: $TX_HASH"
  echo "   🔗 View on explorer: https://explorer.aptoslabs.com/?network=testnet&transaction=$TX_HASH"
  echo ""
  echo "   ⏳ Waiting 10 seconds for confirmation..."
  sleep 10
  
  # Final balance
  echo ""
  echo "7. Final balance:"
  FINAL_BALANCE=$(curl -s "$BASE_URL/wallet/aptos/balance?userId=$USER_ID&network=$NETWORK")
  echo "$FINAL_BALANCE" | jq '.'
else
  echo "   ❌ Transaction failed"
fi

echo ""
echo "===================="
echo "✅ Testnet test complete!"
echo ""

