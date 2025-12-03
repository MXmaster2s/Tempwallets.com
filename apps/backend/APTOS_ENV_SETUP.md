# Aptos Environment Variables Setup

This document outlines the environment variables required for Aptos wallet integration.

## Required Environment Variables

Add the following variables to your `.env` file in `apps/backend/`:

```env
# Aptos RPC URLs (comma-separated for failover)
# Format: PRIMARY_URL,SECONDARY_URL,TERTIARY_URL
# Mainnet: BlockPI (primary) and GetBlock (secondary) for failover
APTOS_MAINNET_RPC_URLS=https://aptos.blockpi.network/aptos/v1/public/v1,https://go.getblock.io/117f21036b9b48fdba40b2d4e694ce6f

# Testnet: Official Aptos Labs fullnode
APTOS_TESTNET_RPC_URLS=https://fullnode.testnet.aptoslabs.com/v1

# Devnet: Official Aptos Labs fullnode (for development)
APTOS_DEVNET_RPC_URLS=https://fullnode.devnet.aptoslabs.com/v1

# Legacy single URL support (fallback if RPC_URLS not set)
APTOS_MAINNET_RPC_URL=https://aptos.blockpi.network/aptos/v1/public/v1
APTOS_TESTNET_RPC_URL=https://fullnode.testnet.aptoslabs.com/v1
APTOS_DEVNET_RPC_URL=https://fullnode.devnet.aptoslabs.com/v1

# Aptos Faucet URLs (for testing)
APTOS_TESTNET_FAUCET_URL=https://faucet.testnet.aptoslabs.com
APTOS_DEVNET_FAUCET_URL=https://faucet.devnet.aptoslabs.com

# Network Selection (default: testnet)
APTOS_DEFAULT_NETWORK=testnet

# Connection Pool Settings
APTOS_MAX_CONNECTIONS_PER_NETWORK=10
APTOS_RPC_TIMEOUT_MS=30000
```

## RPC Provider Information

- **Mainnet Primary**: [BlockPI Network](https://aptos.blockpi.network) - High-performance Aptos node infrastructure
- **Mainnet Secondary**: [GetBlock](https://go.getblock.io) - Backup RPC endpoint for failover
- **Testnet**: Official Aptos Labs fullnode - Maintained by Aptos Foundation
- **Devnet**: Official Aptos Labs fullnode - For development and testing

## Notes

- Multiple RPC URLs per network enable automatic failover when primary endpoint fails
- Connection pooling limits prevent memory leaks (max 10 connections per network)
- 30-second timeout ensures requests don't hang indefinitely
- Default network is mainnet, but testnet/devnet can be used for development

