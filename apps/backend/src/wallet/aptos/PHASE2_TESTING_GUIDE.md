# Phase 2 Testing Guide

This guide provides comprehensive testing steps for Phase 2: Account & Address Management.

## Prerequisites

1. **Build the project:**
```bash
cd apps/backend
pnpm build
```

2. **Ensure dependencies are installed:**
```bash
pnpm install
```

---

## Test 1: Address Utils (Unit Tests)

**Run unit tests:**
```bash
cd apps/backend
pnpm test address.utils.spec.ts
```

**Expected Results:**
- ✅ All normalization tests pass
- ✅ Validation tests pass
- ✅ Address comparison tests pass

---

## Test 2: Address Manager (Unit Tests)

**Run unit tests:**
```bash
pnpm test aptos-address.manager.spec.ts
```

**Expected Results:**
- ✅ Address derivation from seed phrase works
- ✅ Different account indices produce different addresses
- ✅ Addresses are normalized correctly
- ✅ Address validation works

---

## Test 3: Account Factory (Unit Tests)

**Run unit tests:**
```bash
pnpm test aptos-account.factory.spec.ts
```

**Expected Results:**
- ✅ Account creation from seed phrase works
- ✅ Account creation from private key works
- ✅ Different account indices produce different accounts
- ✅ Addresses are normalized before returning
- ✅ Validation errors are thrown for invalid inputs

---

## Test 4: Integration Test (Manual)

**Run integration test:**
```bash
cd apps/backend
pnpm build
node test-phase2-integration.js
```

**Expected Results:**
- ✅ Address derivation works
- ✅ Address normalization works
- ✅ Private key format is correct
- ✅ Different account indices produce different addresses

---

## Test 5: AddressManager Integration

**⚠️ Requires running backend server**

### 5.1: Start Backend Server

```bash
cd apps/backend
pnpm dev
```

### 5.2: Test Address Generation via API

**Create a test user and get addresses:**

```bash
# Create or get user ID (use your auth endpoint)
USER_ID="test-user-123"

# Get all addresses (should include Aptos)
curl -X GET "http://localhost:5005/wallet/addresses?userId=${USER_ID}" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.'
```

**Expected Response:**
```json
{
  "ethereum": "0x...",
  "base": "0x...",
  "polkadot": "5Grwva...",
  "aptos": "0x...",           ← Should appear
  "aptosMainnet": "0x...",    ← Should appear
  "aptosTestnet": "0x...",    ← Should appear
  "aptosDevnet": "0x..."      ← Should appear
}
```

### 5.3: Verify Aptos Addresses

**Check that Aptos addresses:**
1. ✅ Are present in the response
2. ✅ Are normalized (66 chars: 0x + 64 hex)
3. ✅ Are lowercase
4. ✅ Match across all Aptos networks (mainnet/testnet/devnet use same address)

---

## Test 6: Seed Phrase Compatibility

**Test that same seed phrase works for all chains:**

### 6.1: Create Wallet with Known Seed

```bash
# Import a known seed phrase
curl -X POST "http://localhost:5005/wallet/seed" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "userId": "test-user-123",
    "mode": "mnemonic",
    "mnemonic": "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
  }'
```

### 6.2: Verify Addresses Match Expected Values

**Compare with other wallets:**

1. **Import same seed into MetaMask** → Ethereum address should match
2. **Import same seed into Polkadot.js** → Polkadot address should match
3. **Import same seed into Petra Wallet** → Aptos address should match

**Expected:**
- ✅ All addresses match across wallets
- ✅ Same seed phrase → same addresses everywhere

---

## Test 7: Multiple Account Indices

**Test account index support:**

```typescript
// In your test file or API
const address0 = await aptosAddressManager.deriveAddress(seedPhrase, 0);
const address1 = await aptosAddressManager.deriveAddress(seedPhrase, 1);
const address2 = await aptosAddressManager.deriveAddress(seedPhrase, 2);

// Verify all are different
console.log('Address 0:', address0);
console.log('Address 1:', address1);
console.log('Address 2:', address2);

// All should be different
assert(address0 !== address1);
assert(address1 !== address2);
assert(address0 !== address2);
```

---

## Test 8: Address Caching

**Test that addresses are cached correctly:**

1. **First request** - Should generate addresses
2. **Second request** - Should return cached addresses (faster)
3. **Clear cache** - Should regenerate addresses

```bash
# First request (generates addresses)
time curl -X GET "http://localhost:5005/wallet/addresses?userId=${USER_ID}"

# Second request (uses cache)
time curl -X GET "http://localhost:5005/wallet/addresses?userId=${USER_ID}"

# Second request should be faster
```

---

## Test 9: Error Handling

**Test error scenarios:**

### 9.1: Invalid Seed Phrase

```typescript
// Should throw error
await expect(
  aptosAddressManager.deriveAddress('invalid seed', 0)
).rejects.toThrow();
```

### 9.2: Invalid Private Key

```typescript
// Should throw error
expect(() => 
  factory.createAccountFromPrivateKey('invalid')
).toThrow();
```

### 9.3: Invalid Account Index

```typescript
// Should handle negative indices
await expect(
  aptosAddressManager.deriveAddress(seedPhrase, -1)
).rejects.toThrow();
```

---

## Quick Verification Checklist

Before moving to Phase 3, verify:

- [ ] **Address Utils**: All unit tests pass
- [ ] **Address Manager**: Can derive addresses from seed phrase
- [ ] **Account Factory**: Can create accounts from seed/private key
- [ ] **Integration**: Addresses appear in `/wallet/addresses` endpoint
- [ ] **Seed Compatibility**: Same seed works for EVM, Polkadot, and Aptos
- [ ] **Address Format**: All addresses are normalized (66 chars, lowercase)
- [ ] **Multiple Indices**: Different account indices produce different addresses
- [ ] **Caching**: Addresses are cached and retrieved correctly
- [ ] **Error Handling**: Invalid inputs throw appropriate errors

---

## Troubleshooting

### Issue: Addresses not appearing in API response

**Check:**
1. Is `AptosAddressManager` registered in `WalletModule`?
2. Is the backend server running?
3. Check backend logs for errors
4. Verify `AddressManager.getAddresses()` includes Aptos logic

### Issue: Address derivation fails

**Check:**
1. Is seed phrase valid BIP-39 mnemonic?
2. Check Aptos SDK version compatibility
3. Verify derivation path is correct: `m/44'/637'/0'/0'/{index}`

### Issue: Addresses don't match other wallets

**Check:**
1. Verify derivation path matches wallet standard
2. Check account index (should be 0 for first account)
3. Compare with Petra Wallet (official Aptos wallet)

---

## Next Steps

Once all Phase 2 tests pass:
1. ✅ Phase 2 Complete
2. ➡️ Proceed to Phase 3: Transaction Service

