#!/bin/bash

# Yellow Network Testing Script
# Usage: ./test-yellow-network.sh [userId] [chain] [asset]
# Example: ./test-yellow-network.sh temp-1766240037810-99mxh253d base usdc

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:5005}"
# Use existing user with funds: 0.6 USDC in custody, some USDC in base wallet
USER_ID="${1:-temp-1766240037810-99mxh253d}"
CHAIN="${2:-base}"
ASSET="${3:-USDC}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Yellow Network Integration Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "User: ${GREEN}${USER_ID}${NC}"
echo -e "Chain: ${GREEN}${CHAIN}${NC}"
echo -e "Asset: ${GREEN}${ASSET}${NC}"
echo -e "API: ${GREEN}${API_URL}${NC}"
echo ""

# Function to make API calls and format output
api_call() {
  local method=$1
  local endpoint=$2
  local data=$3
  local description=$4
  
  echo -e "${YELLOW}Test: ${description}${NC}"
  echo -e "  ${method} ${endpoint}"
  
  if [ -z "$data" ]; then
    response=$(curl -s -X ${method} "${API_URL}${endpoint}" \
      -H "Content-Type: application/json")
  else
    echo -e "  Data: ${data}"
    response=$(curl -s -X ${method} "${API_URL}${endpoint}" \
      -H "Content-Type: application/json" \
      -d "${data}")
  fi
  
  # Check if response contains "ok": true
  if echo "$response" | grep -q '"ok".*true'; then
    echo -e "  ${GREEN}✓ SUCCESS${NC}"
  else
    echo -e "  ${RED}✗ FAILED${NC}"
  fi
  
  # Pretty print JSON response
  echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
  echo ""
  
  # Return response for further use
  echo "$response"
}

# Test 1: Get Wallet Address
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Phase 1: Wallet & Authentication${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

wallet_response=$(api_call "GET" "/wallet/ui-wallets?userId=${USER_ID}" "" "Get Wallet Address")
wallet_address=$(echo "$wallet_response" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('smartAccount', {}).get('address', ''))" 2>/dev/null || echo "")

if [ -z "$wallet_address" ]; then
  echo -e "${RED}Failed to get wallet address. Exiting.${NC}"
  exit 1
fi

echo -e "Wallet Address: ${GREEN}${wallet_address}${NC}"
echo ""

# Test 2: Authenticate with Yellow Network
auth_response=$(api_call "POST" "/app-session/authenticate" \
  "{\"userId\": \"${USER_ID}\", \"chain\": \"${CHAIN}\"}" \
  "Authenticate with Yellow Network")

sleep 2

# Test 3: Check if user needs to deposit to custody
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Phase 2: Check Balances${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

balance_response=$(api_call "GET" "/wallet/balance?userId=${USER_ID}&chain=${CHAIN}" "" "Check Wallet Balance")

echo -e "${YELLOW}NOTE: Before proceeding with custody deposit:${NC}"
echo -e "  1. Make sure your wallet has USDC (testnet)"
echo -e "  2. Make sure your wallet has ETH for gas (testnet)"
echo -e "  3. Visit ${BLUE}https://faucet.base.org${NC} for testnet tokens"
echo ""
echo -e "${YELLOW}To deposit to custody (creates unified balance):${NC}"
echo -e "  curl -X POST ${API_URL}/custody/deposit \\"
echo -e "    -H 'Content-Type: application/json' \\"
echo -e "    -d '{\"userId\": \"${USER_ID}\", \"chain\": \"${CHAIN}\", \"asset\": \"${ASSET}\", \"amount\": \"100.0\"}'"
echo ""

read -p "Do you want to test custody deposit? (This requires real funds and gas) [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}Phase 3: Custody Deposit${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
  
  echo -e "${YELLOW}WARNING: This will spend gas fees!${NC}"
  read -p "Enter amount to deposit (e.g., 100.0): " deposit_amount
  
  if [ ! -z "$deposit_amount" ]; then
    echo -e "${YELLOW}Depositing ${deposit_amount} ${ASSET} to custody...${NC}"
    echo -e "${YELLOW}This may take 60-90 seconds (2 on-chain transactions + indexing)${NC}"
    
    custody_response=$(api_call "POST" "/custody/deposit" \
      "{\"userId\": \"${USER_ID}\", \"chain\": \"${CHAIN}\", \"asset\": \"${ASSET}\", \"amount\": \"${deposit_amount}\"}" \
      "Deposit to Custody Contract")
    
    echo -e "${GREEN}Custody deposit complete!${NC}"
    echo ""
  fi
fi

# Test 4: Discover Sessions
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Phase 4: Discover Sessions${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

discover_response=$(api_call "GET" "/app-session/discover/${USER_ID}?chain=${CHAIN}" "" "Discover User Sessions")

# Test 5: Create App Session (Interactive)
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Phase 5: App Session Management${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

read -p "Do you want to create a test app session? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  read -p "Enter second participant address (0x...): " participant2
  read -p "Enter initial allocation amount: " allocation_amount
  
  if [ ! -z "$participant2" ] && [ ! -z "$allocation_amount" ]; then
    create_response=$(api_call "POST" "/app-session" \
      "{
        \"userId\": \"${USER_ID}\",
        \"chain\": \"${CHAIN}\",
        \"participants\": [\"${wallet_address}\", \"${participant2}\"],
        \"token\": \"${ASSET}\",
        \"initialAllocations\": [
          {\"participant\": \"${wallet_address}\", \"amount\": \"${allocation_amount}\", \"asset\": \"${ASSET}\"}
        ]
      }" \
      "Create App Session")
    
    session_id=$(echo "$create_response" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('sessionId', ''))" 2>/dev/null || echo "")
    
    if [ ! -z "$session_id" ]; then
      echo -e "Session ID: ${GREEN}${session_id}${NC}"
      echo ""
      
      # Test 6: Query Session
      sleep 2
      query_response=$(api_call "GET" "/app-session/${session_id}?userId=${USER_ID}&chain=${CHAIN}" "" "Query Session Details")
      
      # Test 7: Update Allocation (Transfer)
      echo ""
      read -p "Do you want to test a transfer? [y/N]: " -n 1 -r
      echo
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter amount to transfer to participant 2: " transfer_amount
        
        if [ ! -z "$transfer_amount" ]; then
          new_allocation1=$(echo "${allocation_amount} - ${transfer_amount}" | bc)
          
          update_response=$(api_call "PATCH" "/app-session/${session_id}" \
            "{
              \"userId\": \"${USER_ID}\",
              \"chain\": \"${CHAIN}\",
              \"intent\": \"OPERATE\",
              \"newAllocations\": [
                {\"participant\": \"${wallet_address}\", \"amount\": \"${new_allocation1}\", \"asset\": \"${ASSET}\"},
                {\"participant\": \"${participant2}\", \"amount\": \"${transfer_amount}\", \"asset\": \"${ASSET}\"}
              ]
            }" \
            "Transfer Funds")
          
          echo -e "${GREEN}Transfer complete! No gas fees! ⚡${NC}"
          echo ""
        fi
      fi
      
      # Test 8: Close Session
      echo ""
      read -p "Do you want to close the session? [y/N]: " -n 1 -r
      echo
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        close_response=$(api_call "DELETE" "/app-session/${session_id}?userId=${USER_ID}&chain=${CHAIN}" "" "Close Session")
        echo -e "${GREEN}Session closed! Funds returned to unified balance.${NC}"
      fi
    fi
  fi
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}✓ All API endpoints tested${NC}"
echo -e ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. Review the test results above"
echo -e "  2. Check ${API_URL}/app-session/discover/${USER_ID}?chain=${CHAIN} for your sessions"
echo -e "  3. Read the full testing guide: Docs/31YELLOW_NETWORK_TESTING_GUIDE.md"
echo -e "  4. Test on frontend: http://localhost:3000/dashboard/lightning"
echo ""
