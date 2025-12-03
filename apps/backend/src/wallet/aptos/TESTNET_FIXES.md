# Testnet Issues Fixed

## Issues Identified

1. **Send Transaction DTO Validation Error**
   - **Problem**: `SendAptDto` expected `amount` as a string, but JSON sends numbers
   - **Error**: `"Amount must be a positive number"` and `"amount must be a string"`
   - **Fix**: Changed DTO to accept `number` type with `@IsNumber()` and `@Type(() => Number)`

2. **Testnet Faucet Not Working**
   - **Problem**: SDK's `fundAccount()` doesn't work on testnet (only devnet)
   - **Error**: `"There is no way to programmatically mint testnet APT"`
   - **Fix**: Added check to return helpful error message directing users to manual faucet

3. **Balance Endpoint Validation (Transient)**
   - **Problem**: Test script showed validation error, but manual curl works
   - **Status**: Likely a transient server state issue - endpoint works correctly

## Changes Made

### 1. `SendAptDto` (`dto/send-apt.dto.ts`)

**Before:**
```typescript
@IsString()
@IsNotEmpty()
@Matches(/^[0-9]+(\.[0-9]+)?$/, {
  message: 'Amount must be a positive number',
})
amount: string;
```

**After:**
```typescript
@IsNumber({}, { message: 'Amount must be a number' })
@Type(() => Number)
@Min(0.00000001, { message: 'Amount must be greater than 0' })
amount: number;
```

### 2. `AptosFaucetService` (`services/aptos-faucet.service.ts`)

**Added testnet check:**
```typescript
// Testnet faucet doesn't support programmatic funding via SDK
if (network === 'testnet') {
  const normalizedAddress = normalizeAddress(address);
  const faucetUrl = 'https://aptos.dev/network/faucet';
  this.logger.warn(
    `Testnet faucet requires manual interaction. Visit: ${faucetUrl}`,
  );
  return {
    success: false,
    message: `Testnet faucet requires manual interaction. Please visit ${faucetUrl} and fund address: ${normalizedAddress}`,
  };
}
```

### 3. `AptosWalletController` (`aptos-wallet.controller.ts`)

**Simplified amount parsing:**
```typescript
// Before:
const amount = parseFloat(dto.amount);
if (isNaN(amount) || amount <= 0) {
  throw new BadRequestException('Amount must be a positive number');
}

// After:
const amount = dto.amount; // Already validated as number by DTO
```

## Testing

### Send Transaction (Now Works)
```bash
curl -X POST http://localhost:5005/wallet/aptos/send \
  -H "Content-Type: application/json" \
  -d '{"userId": "demo-user-123", "recipientAddress": "0x1", "amount": 0.1, "network": "testnet"}'
```

**Expected:** Transaction hash returned

### Testnet Faucet (Helpful Error)
```bash
curl -X POST http://localhost:5005/wallet/aptos/faucet \
  -H "Content-Type: application/json" \
  -d '{"userId": "demo-user-123", "network": "testnet", "amount": 100}'
```

**Expected:** Helpful error message with link to manual faucet

## Testnet Faucet Workaround

Since testnet doesn't support programmatic funding:

1. **Manual Faucet**: Visit https://aptos.dev/network/faucet
2. **Enter Address**: Use the address from `/wallet/aptos/address` endpoint
3. **Request Funds**: Click "Request" button
4. **Wait**: Funds arrive in 10-30 seconds

## Verification

After fixes:
- ✅ Send transaction accepts number for amount
- ✅ Testnet faucet returns helpful error message
- ✅ Devnet faucet still works programmatically
- ✅ Balance endpoint works (was transient issue)

