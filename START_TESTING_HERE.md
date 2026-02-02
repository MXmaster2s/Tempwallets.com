# 🚀 Start Testing Yellow Network - Quick Guide

**Your Test User:** `temp-1766240037810-99mxh253d`  
**Available Balance:** 0.6 USDC in custody + USDC in Base wallet  
**Date:** February 1, 2026

---

## ⚡ Quick Start (Choose Your Path)

### Option A: Postman (Easiest - Visual UI) ⭐

1. **Start Backend:**
```bash
cd /Users/monstu/Developer/Tempwallets.com/apps/backend
pnpm run dev
```

2. **Import Collection:**
   - Open Postman
   - Click "Import" → "Upload Files"
   - Select: `Yellow-Network-Lightning.postman_collection.json`
   - Collection will appear with all endpoints pre-configured!

3. **Run Tests:**
   - Open folder "2. Wallet Operations" → Click "Get Wallet Address" → Send
   - Open folder "3. Authentication" → Click "Authenticate with Yellow Network" → Send
   - Continue through folders in order!

**All variables auto-save:** Wallet address, session ID, etc. are automatically saved between requests! 🎉

---

### Option B: Automated Script (Fast - Terminal)

```bash
cd /Users/monstu/Developer/Tempwallets.com
./quick-test.sh
```

That's it! The script will:
- ✅ Get your wallet address
- ✅ Authenticate with Yellow Network
- ✅ Check balances
- ✅ Discover existing sessions
- ✅ Optionally create new session

---

## 🎯 Postman Collection Features

The Postman collection includes:

✅ **Auto-saved Variables**
- Wallet address saved from "Get Wallet Address" 
- Session ID saved from "Create App Session"
- All subsequent requests use these automatically!

✅ **Organized Folders**
1. Health Check - Verify backend
2. Wallet Operations - Get wallet address
3. Authentication - Connect to Yellow Network
4. Balance & Discovery - Check balances, find sessions
5. App Session - Create, query, transfer, close sessions
6. Custody Operations - Deposit/withdraw (costs gas)
7. Payment Channels - Optional 2-party channels

✅ **Pre-configured Test User**
- User ID: `temp-1766240037810-99mxh253d`
- Chain: `base`
- Asset: `USDC`
- Available: 0.6 USDC in custody

✅ **Automatic Tests**
- Response time checks
- Status code validation
- Success verification for key operations

✅ **Multiple Transfer Examples**
- Equal split example
- Send to participant example
- Easy to modify amounts

---

## 📋 What to Test (Checklist)

Copy this and check off as you test:

```
CORE FUNCTIONALITY:
[ ] 1. Wallet retrieval works
[ ] 2. Yellow Network authentication succeeds
[ ] 3. Balance check shows custody balance (0.6 USDC)
[ ] 4. Session discovery returns existing sessions (or empty array)
[ ] 5. Can create new app session
[ ] 6. Can query session details
[ ] 7. Can transfer within session (gasless!)
[ ] 8. Can close session

CUSTODY OPERATIONS:
[ ] 9. Can deposit more USDC to custody (costs gas)
[ ] 10. Unified balance increases after deposit
[ ] 11. Custody deposit step-by-step shows: approve → deposit → indexing → success

CHANNEL OPERATIONS (Optional):
[ ] 12. Can fund payment channel
[ ] 13. Channel balance shows correct amount

UI TESTING:
[ ] 14. "Add to Unified Balance" button works
[ ] 15. Custody deposit modal shows progress
[ ] 16. Lightning nodes list appears
[ ] 17. Can create session from UI
[ ] 18. Can send transfer from UI
```

---

## 🎯 Test Scenarios

### Scenario 1: Simple Authentication Test

```bash
# Get wallet
curl "http://localhost:5005/wallet/addresses?userId=temp-1766240037810-99mxh253d"

# Authenticate
curl -X POST http://localhost:5005/app-session/authenticate \
  -H "Content-Type: application/json" \
  -d '{"userId":"temp-1766240037810-99mxh253d","chain":"base"}'

# ✅ Should return: {"ok":true,"authenticated":true,...}
```

### Scenario 2: Discover Existing Sessions

```bash
curl "http://localhost:5005/app-session/discover/temp-1766240037810-99mxh253d?chain=base"

# ✅ Should return: {"ok":true,"sessions":[...],...}
```

### Scenario 3: Create App Session

```bash
# First, get your wallet address from Scenario 1
# Replace [YOUR_WALLET] below

curl -X POST http://localhost:5005/app-session \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "temp-1766240037810-99mxh253d",
    "chain": "base",
    "participants": ["0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"],
    "token": "USDC",
    "initialAllocations": [{
      "participant": "[YOUR_WALLET]",
      "amount": "0.1",
      "asset": "USDC"
    }]
  }'

# ✅ Should return: {"ok":true,"data":{"sessionId":"0x...",...}}
# ✅ Save the sessionId for next test!
```

### Scenario 4: Query Session

```bash
# Replace [SESSION_ID] with the sessionId from Scenario 3

curl "http://localhost:5005/app-session/[SESSION_ID]?userId=temp-1766240037810-99mxh253d&chain=base"

# ✅ Should return session details with allocations
```

### Scenario 5: Transfer (Gasless!)

```bash
# Replace [SESSION_ID] and [YOUR_WALLET]

curl -X PATCH "http://localhost:5005/app-session/[SESSION_ID]" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "temp-1766240037810-99mxh253d",
    "chain": "base",
    "intent": "OPERATE",
    "newAllocations": [
      {
        "participant": "[YOUR_WALLET]",
        "amount": "0.05",
        "asset": "USDC"
      },
      {
        "participant": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0",
        "amount": "0.05",
        "asset": "USDC"
      }
    ]
  }'

# ✅ Should return: {"ok":true,"session":{"version":2,...}}
# ✅ Should be INSTANT (< 1 second)
# ✅ NO GAS FEES! 🎉
```

### Scenario 6: Close Session

```bash
curl -X DELETE "http://localhost:5005/app-session/[SESSION_ID]?userId=temp-1766240037810-99mxh253d&chain=base"

# ✅ Should return: {"ok":true,"status":"closed"}
# ✅ Funds return to unified balance
```

---

## 🎨 Test via UI (Visual Testing)

### Step 1: Start Frontend

```bash
cd /Users/monstu/Developer/Tempwallets.com/apps/web
pnpm run dev

# Open: http://localhost:3000
```

### Step 2: Login as Test User

- Use the credentials for user `temp-1766240037810-99mxh253d`
- Or create a new session with this userId

### Step 3: Navigate to Lightning Nodes

- Click "Lightning Nodes" in sidebar
- You should see your nodes (or empty state)

### Step 4: Test Custody Deposit

1. Click **"Add to Unified Balance"**
2. Select:
   - Chain: **Base**
   - Asset: **USDC**
   - Amount: **0.1**
3. Click **"Deposit"**
4. Watch the progress:
   - ⏳ Approving USDC...
   - ⏳ Depositing to custody...
   - ⏳ Waiting for indexing...
   - ✅ Success! Unified balance updated
5. Check your new balance

### Step 5: Create Lightning Node

1. Click **"Create Lightning Node"**
2. Fill in:
   - Chain: **Base**
   - Token: **USDC**
   - Add participant: **0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0**
   - Initial amount: **0.1 USDC**
3. Click **"Create"**
4. Should see new node in list

### Step 6: Test Transfer

1. Click on your Lightning Node
2. Click **"Send Transfer"**
3. Select recipient
4. Enter amount: **0.05**
5. Click **"Send"**
6. Should be **INSTANT** and **FREE** (no gas!)

---

## 📊 Expected Results

### ✅ Success Indicators

**Authentication:**
- `authenticated: true`
- Response time < 5 seconds
- Wallet address matches your wallet

**Session Discovery:**
- Returns array (may be empty)
- No errors

**Session Creation:**
- Returns sessionId
- Status is "open"
- Participants listed correctly
- Initial allocations match request

**Transfers:**
- Version increments (1 → 2 → 3...)
- Allocations update correctly
- **INSTANT** (< 1 second)
- **NO GAS FEES**

**Custody Deposit:**
- Two transaction hashes returned (approve + deposit)
- Unified balance increases
- Takes 60-90 seconds total
- Shows in Yellow Network

---

## ❌ Common Errors & Fixes

### Error: "Authentication failed"

**Fix:**
```bash
# Check backend is running
curl http://localhost:5005/health

# Check Yellow Network config in backend
# Verify YELLOW_NETWORK_WS_URL in .env
```

### Error: "Insufficient balance"

**Fix:**
You have 0.6 USDC in custody. If creating session with > 0.6 USDC allocation, deposit more:

```bash
curl -X POST http://localhost:5005/custody/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "userId":"temp-1766240037810-99mxh253d",
    "chain":"base",
    "asset":"USDC",
    "amount":"1.0"
  }'
```

### Error: "Session not found"

**Fix:**
- Make sure you're using the correct sessionId
- Session may have been closed
- Run discover to see available sessions

### Error: Custody deposit timeout

**Fix:**
- Check you have ETH for gas
- Check wallet has USDC to deposit
- Transaction may still be pending - check block explorer
- Yellow Network indexing may be slow - wait 2-3 minutes

---

## 📚 Full Documentation

**For Postman Collection:**
👉 **Import: `Yellow-Network-Lightning.postman_collection.json`**

For detailed testing guide with all endpoints:
👉 **[Docs/31YELLOW_NETWORK_TESTING_GUIDE.md](./Docs/31YELLOW_NETWORK_TESTING_GUIDE.md)**

For API endpoint reference:
👉 **[Docs/32YELLOW_NETWORK_API_COLLECTION.md](./Docs/32YELLOW_NETWORK_API_COLLECTION.md)**

For architecture details:
👉 **[Docs/25CLEAN_ARCHITECTURE_IMPLEMENTATION.md](./Docs/25CLEAN_ARCHITECTURE_IMPLEMENTATION.md)**

---

## 🎯 Quick Win Tests (Do These First)

### Test 1: Can I authenticate? (30 seconds)

```bash
curl -X POST http://localhost:5005/app-session/authenticate \
  -H "Content-Type: application/json" \
  -d '{"userId":"temp-1766240037810-99mxh253d","chain":"base"}'
```

**Expected:** `{"ok":true,"authenticated":true,...}`

---

### Test 2: Can I discover sessions? (10 seconds)

```bash
curl "http://localhost:5005/app-session/discover/temp-1766240037810-99mxh253d?chain=base"
```

**Expected:** `{"ok":true,"sessions":[...]}`

---

### Test 3: Can I create a session? (30 seconds)

Run the automated script:
```bash
./quick-test.sh
# Follow prompts to create session
```

**Expected:** Session created with sessionId

---

### Test 4: Can I transfer (gasless)? (10 seconds)

Use sessionId from Test 3, run Scenario 5 above.

**Expected:** Instant transfer, no gas fees!

---

## 🎉 Success Criteria

You've successfully tested Yellow Network if:

- ✅ Authentication works consistently
- ✅ Can create app sessions
- ✅ Can query session details
- ✅ Can transfer funds (gasless!)
- ✅ Transfers are instant (< 1 second)
- ✅ Custody deposits work (with gas)
- ✅ Unified balance updates correctly
- ✅ UI reflects all operations

---

## 🚨 Need Help?

**Check logs:**
```bash
cd apps/backend
tail -f logs/application.log
```

**Check Yellow Network connection:**
```bash
# Look for WebSocket connection messages
grep "Yellow Network" logs/application.log
```

**Verify configuration:**
```bash
# Check .env has correct Yellow Network settings
cat apps/backend/.env | grep YELLOW
```

---

## 📝 Report Issues

When reporting issues, include:

1. **What you tried:** (command or UI action)
2. **What happened:** (error message, response)
3. **What you expected:** (expected behavior)
4. **Logs:** (backend logs for that time)
5. **User ID:** temp-1766240037810-99mxh253d

---

**Happy Testing! 🚀**

Start with the automated test script:
```bash
./quick-test.sh
```

Then move to manual API tests, then UI testing.

Good luck! 🎉
