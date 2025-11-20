#!/bin/bash

# API Test Script for Wallet Persistence and Caching
# Usage: ./test/api-test.sh [base_url]
# Example: ./test/api-test.sh http://localhost:5005

BASE_URL="${1:-http://localhost:5005}"
USER_ID="test-fingerprint-$(date +%s)"

echo "=========================================="
echo "Wallet Persistence API Test Script"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo "User ID: $USER_ID"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Create wallet seed (optional, wallet auto-creates)
echo -e "${BLUE}Test 1: Creating wallet seed (optional)...${NC}"
curl -X POST "$BASE_URL/wallet/seed" \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$USER_ID\", \"mode\": \"random\"}" \
  -w "\nStatus: %{http_code}\n" \
  -s
echo ""

# Test 2: Get addresses (first call - generates and saves)
echo -e "${BLUE}Test 2: Getting addresses (first call - generates and saves)...${NC}"
echo "Measuring time..."
time curl "$BASE_URL/wallet/addresses?userId=$USER_ID" \
  -H "Accept: application/json" \
  -w "\nStatus: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Response received"
echo ""

# Test 3: Get addresses (second call - should be instant from DB)
echo -e "${GREEN}Test 3: Getting addresses (second call - should be INSTANT from DB)...${NC}"
echo "Measuring time (should be < 100ms)..."
time curl "$BASE_URL/wallet/addresses?userId=$USER_ID" \
  -H "Accept: application/json" \
  -w "\nStatus: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Response received"
echo ""

# Test 4: Address streaming (should stream cached first, then generate missing)
echo -e "${BLUE}Test 4: Address streaming (cached first, then new)...${NC}"
curl -N "$BASE_URL/wallet/addresses-stream?userId=$USER_ID" \
  -H "Accept: text/event-stream" \
  -w "\nStatus: %{http_code}\n" \
  -s | head -20
echo ""

# Test 5: Get balances (should be fast, may return 0 initially)
echo -e "${BLUE}Test 5: Getting balances (cached, may be 0 initially)...${NC}"
echo "Measuring time..."
time curl "$BASE_URL/wallet/balances?userId=$USER_ID" \
  -H "Accept: application/json" \
  -w "\nStatus: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Response received"
echo ""

# Test 6: Refresh balances (should call API)
echo -e "${YELLOW}Test 6: Refreshing balances (calls external API)...${NC}"
echo "This may take a few seconds..."
time curl -X POST "$BASE_URL/wallet/balances/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$USER_ID\"}" \
  -w "\nStatus: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Response received"
echo ""

# Test 7: Get cached balances (should be fast)
echo -e "${GREEN}Test 7: Getting cached balances (should be INSTANT)...${NC}"
echo "Measuring time (should be < 100ms)..."
time curl "$BASE_URL/wallet/balances?userId=$USER_ID" \
  -H "Accept: application/json" \
  -w "\nStatus: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Response received"
echo ""

# Test 8: Force refresh with query parameter
echo -e "${YELLOW}Test 8: Force refresh balances (?refresh=true)...${NC}"
time curl "$BASE_URL/wallet/balances?userId=$USER_ID&refresh=true" \
  -H "Accept: application/json" \
  -w "\nStatus: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Response received"
echo ""

# Test 9: Get token balances
echo -e "${BLUE}Test 9: Getting token balances...${NC}"
curl "$BASE_URL/wallet/token-balances?userId=$USER_ID&chain=ethereum" \
  -H "Accept: application/json" \
  -w "\nStatus: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Response received"
echo ""

# Test 10: Get assets any
echo -e "${BLUE}Test 10: Getting assets (any chain)...${NC}"
curl "$BASE_URL/wallet/assets-any?userId=$USER_ID" \
  -H "Accept: application/json" \
  -w "\nStatus: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Response received"
echo ""

echo "=========================================="
echo -e "${GREEN}All tests completed!${NC}"
echo "=========================================="
echo ""
echo "Summary:"
echo "- Test 2: First address call (slow - generates)"
echo "- Test 3: Second address call (FAST - cached from DB)"
echo "- Test 5: First balance call (fast - may be empty)"
echo "- Test 6: Balance refresh (slow - calls API)"
echo "- Test 7: Cached balance call (FAST - from DB)"
echo ""
echo "Expected behavior:"
echo "- Addresses should be instant on second call (< 100ms)"
echo "- Balances should be instant after refresh (< 100ms)"
echo "- Streaming should send cached addresses first"

