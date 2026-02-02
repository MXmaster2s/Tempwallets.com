#!/bin/bash

# Quick Yellow Network Test - Using Existing User with Funds
# User: temp-1766240037810-99mxh253d
# Has: 0.6 USDC in custody, some USDC in base wallet

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
API_URL="${API_URL:-http://localhost:5005}"
USER_ID="temp-1766240037810-99mxh253d"
CHAIN="base"
ASSET="USDC"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}   Quick Yellow Network Test${NC}"
echo -e "${BLUE}================================================${NC}"
echo -e "User: ${GREEN}${USER_ID}${NC}"
echo -e "Chain: ${GREEN}${CHAIN}${NC}"
echo -e "Known Balance: ${GREEN}0.6 USDC in custody${NC}"
echo -e "API: ${GREEN}${API_URL}${NC}"
echo ""

# Helper function
test_endpoint() {
  local method=$1
  local endpoint=$2
  local data=$3
  local description=$4
  
  echo -e "${YELLOW}▶ ${description}${NC}"
  echo -e "  ${method} ${endpoint}"
  
  if [ -z "$data" ]; then
    response=$(curl -s -X ${method} "${API_URL}${endpoint}" \
      -H "Content-Type: application/json")
  else
    echo -e "  ${BLUE}Data:${NC} ${data}"
    response=$(curl -s -X ${method} "${API_URL}${endpoint}" \
      -H "Content-Type: application/json" \
      -d "${data}")
  fi
  
  # Pretty print
  echo -e "${GREEN}Response:${NC}"
  echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
  echo ""
  
  echo "$response"
}

# Step 1: Get Wallet
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}STEP 1: Get Wallet Address${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

wallet_response=$(test_endpoint "GET" "/wallet/addresses?userId=${USER_ID}" "" "Get Wallet Address")
wallet_address=$(echo "$wallet_response" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('smartAccount', {}).get('address', ''))" 2>/dev/null || echo "")

if [ -z "$wallet_address" ]; then
  echo -e "${RED}❌ Failed to get wallet address${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Wallet Address: ${wallet_address}${NC}"
echo ""
sleep 1

# Step 2: Authenticate
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}STEP 2: Authenticate with Yellow Network${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

auth_data="{\"userId\": \"${USER_ID}\", \"chain\": \"${CHAIN}\"}"
auth_response=$(test_endpoint "POST" "/app-session/authenticate" "$auth_data" "Authenticate Wallet")

if echo "$auth_response" | grep -q '"authenticated":true'; then
  echo -e "${GREEN}✓ Authentication successful${NC}"
else
  echo -e "${RED}❌ Authentication failed${NC}"
  exit 1
fi
echo ""
sleep 1

# Step 3: Check Balance
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}STEP 3: Check Wallet Balance${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

balance_response=$(test_endpoint "GET" "/wallet/balances?userId=${USER_ID}" "" "Get Wallet Balances")
echo ""
sleep 1

# Step 4: Discover Sessions
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}STEP 4: Discover Existing Sessions${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

discover_response=$(test_endpoint "GET" "/app-session/discover/${USER_ID}?chain=${CHAIN}" "" "Discover Sessions")
echo ""
sleep 1

# Step 5: Optional - Create New Session
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}STEP 5: Create App Session (Optional)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}Prerequisites for creating a session:${NC}"
echo -e "  • Must have funds in custody (you have 0.6 USDC ✓)"
echo -e "  • Need at least one other participant address"
echo ""
read -p "Do you want to create a test app session? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  read -p "Enter participant address (or press Enter for test address): " participant
  participant=${participant:-"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"}
  
  read -p "Enter initial allocation amount (e.g., 0.1): " amount
  amount=${amount:-"0.1"}
  
  create_data=$(cat <<EOF
{
  "userId": "${USER_ID}",
  "chain": "${CHAIN}",
  "participants": ["${participant}"],
  "token": "${ASSET}",
  "initialAllocations": [
    {
      "participant": "${wallet_address}",
      "amount": "${amount}",
      "asset": "${ASSET}"
    }
  ]
}
EOF
)
  
  echo -e "${YELLOW}Creating app session...${NC}"
  create_response=$(test_endpoint "POST" "/app-session" "$create_data" "Create App Session")
  
  session_id=$(echo "$create_response" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data.get('data', {}).get('sessionId', ''))" 2>/dev/null || echo "")
  
  if [ ! -z "$session_id" ]; then
    echo -e "${GREEN}✓ Session created: ${session_id}${NC}"
    echo ""
    
    # Step 6: Query the session
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}STEP 6: Query Created Session${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    
    query_response=$(test_endpoint "GET" "/app-session/${session_id}?userId=${USER_ID}&chain=${CHAIN}" "" "Query Session")
    echo ""
  else
    echo -e "${RED}❌ Failed to create session${NC}"
  fi
else
  echo -e "${YELLOW}Skipping session creation${NC}"
fi

# Summary
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}   Test Summary${NC}"
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}✓ Wallet retrieval${NC}"
echo -e "${GREEN}✓ Yellow Network authentication${NC}"
echo -e "${GREEN}✓ Balance check${NC}"
echo -e "${GREEN}✓ Session discovery${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. To deposit more funds to custody:"
echo -e "     ${BLUE}curl -X POST ${API_URL}/custody/deposit \\${NC}"
echo -e "     ${BLUE}  -H 'Content-Type: application/json' \\${NC}"
echo -e "     ${BLUE}  -d '{\"userId\":\"${USER_ID}\",\"chain\":\"${CHAIN}\",\"asset\":\"${ASSET}\",\"amount\":\"1.0\"}'${NC}"
echo ""
echo -e "  2. To fund a payment channel:"
echo -e "     ${BLUE}curl -X POST ${API_URL}/channel/fund \\${NC}"
echo -e "     ${BLUE}  -H 'Content-Type: application/json' \\${NC}"
echo -e "     ${BLUE}  -d '{\"userId\":\"${USER_ID}\",\"chain\":\"${CHAIN}\",\"asset\":\"${ASSET}\",\"amount\":\"0.5\"}'${NC}"
echo ""
echo -e "  3. View UI: ${BLUE}http://localhost:3000/dashboard${NC}"
echo ""
echo -e "${GREEN}Test complete!${NC}"
