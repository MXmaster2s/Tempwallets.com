# @repo/wallet-sdk

Pure wallet/chain logic layer with @tetherto/wdk integration.

## Overview

This package provides wallet creation, management, and transaction functionality using the @tetherto Wallet Development Kit.

## Usage

```typescript
import { WalletFactory } from '@repo/wallet-sdk';

const factory = new WalletFactory();
const wallet = factory.createWallet({
  chainId: '8453',
  bundlerUrl: 'https://bundler.example.com',
});
```

## Structure

- `wallet/` - Wallet creation and management
- `chains/` - Chain configurations and bundler clients
- `types/` - Shared TypeScript types

