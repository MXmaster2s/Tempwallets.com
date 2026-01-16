# Tempwallets.com - AI Agent Instructions

## Project Overview
Tempwallets.com is a multi-chain, HD wallet management platform supporting 15+ blockchains including EVM chains (Ethereum, Base, Arbitrum, Polygon, Avalanche), Substrate/Polkadot parachains, Aptos, Bitcoin, Solana, and Tron. Built as a Turborepo monorepo with NestJS backend and Next.js 15 frontend.

## Architecture

### Monorepo Structure
```
apps/
  backend/         # NestJS API (port 3001)
  web/            # Next.js 15 frontend (port 3000)
packages/
  types/          # Shared TypeScript DTOs (used by backend)
  ui/             # shadcn/ui component library
```

**Critical Build Order**: `types` → `backend` → `web` (Turborepo enforces this via `turbo.json`)

### Key Technology Decisions

**Backend (NestJS):**
- Uses `type: "module"` with ESM imports (`.js` extensions required: `import { X } from './file.js'`)
- All files use **class decorators** (`@Injectable()`, `@Controller()`, `@Module()`) - ensure `experimentalDecorators: true` in tsconfig
- Prisma ORM with PostgreSQL (migrations auto-run on deploy via `start:prod`)
- **Never store private keys** - derive on-demand from encrypted seed via `SeedManager`

**Frontend (Next.js):**
- React 19 + Next.js 15 with Turbopack
- Favor **React Server Components** - minimize `'use client'` (only for hooks, browser APIs, interactivity)
- Use `shadcn/ui` from `@repo/ui` package for components
- State management: Context API for wallet data (`WalletDataContext`), React Query for server state

**Multi-Chain Strategy:**
- Single BIP-39 seed phrase generates addresses across ALL chains (same seed for EVM/BTC/Solana/Aptos/Substrate)
- Uses `@tetherto/wdk` (Wallet Development Kit) for EVM/BTC/Solana/Tron accounts via `AccountFactory`
- Custom implementations for Substrate (Polkadot.js) and Aptos (@aptos-labs/ts-sdk)

## Critical Wallet Security Architecture

### Seed Management Flow (NEVER DEVIATE)
1. **Seed Storage**: Encrypted in `WalletSeed` table using AES-256-GCM (`EncryptionService`)
   - `WALLET_ENC_KEY` env var (32-byte base64) is the master encryption key
   - Each seed has unique IV + auth tag

2. **Seed Retrieval**: Always via `SeedManager.getSeed(userId)` - **NEVER** read directly from DB

3. **Address Derivation**: 
   - EVM chains: BIP-44 `m/44'/60'/0'/0/0` (via WDK)
   - Aptos: BIP-44 `m/44'/637'/0'/0'/0'` (custom in `aptos/` module)
   - Substrate: sr25519 derivation (custom in `substrate/` module)
   - **Private keys never persisted** - derived in-memory, used, then discarded

4. **Address Caching**: `AddressCacheRepository` stores derived addresses (not keys) for performance

### Module Organization Pattern

All blockchain implementations follow this structure (see `apps/backend/src/wallet/aptos/` and `substrate/` as examples):

```
<chain>/
  ├── <chain>.module.ts          # NestJS module registration
  ├── <chain>-wallet.controller.ts  # HTTP endpoints
  ├── config/                    # Chain-specific configs
  ├── dto/                       # Request/response DTOs
  ├── factories/                 # Account creation from seed
  ├── managers/                  # Business logic orchestration
  ├── services/                  # RPC, transaction, balance services
  ├── types/                     # TypeScript interfaces
  └── utils/                     # Helpers
```

**When adding new chain support**:
1. Create new module folder following this structure
2. Register in `WalletModule` imports
3. Add chain key to `AllChainTypes` union in `wallet/types/chain.types.ts`
4. Update `AddressManager` to handle new chain derivation

## Development Workflows

### Running the Project
```bash
# Install dependencies (uses pnpm workspaces)
pnpm install

# Development mode (runs all apps)
pnpm dev

# Run specific app
pnpm dev --filter=backend   # Backend only
pnpm dev --filter=web       # Frontend only

# Production build
pnpm build                  # Builds all (types → backend → web)
```

### Database Migrations (Prisma)
```bash
cd apps/backend

# Create migration
pnpm exec prisma migrate dev --name <description>

# Deploy to production (auto-runs via start:prod script)
pnpm exec prisma migrate deploy

# View database
pnpm run studio
```

### Testing Patterns
- Backend uses Jest with `test-setup.js` for mocks
- Mock external services in `__mocks__/` directories (e.g., `wallet/services/__mocks__/`)
- E2E tests in `apps/backend/test/` directory

### Common Issues

**"does not have a commit checked out" error:**
```bash
rm -rf apps/backend/.git
git add .
```

**Decorator errors (`class-validator`):**
Ensure `experimentalDecorators: true` and `useDefineForClassFields: false` in tsconfig

**Turborepo cache issues:**
```bash
# Clear cache and rebuild
rm -rf .turbo node_modules
pnpm install
pnpm build
```

## Backend Service Patterns

### Controller → Service → Manager/Repository Flow
```typescript
// Controller: HTTP layer, validation via DTOs
@Controller('wallet')
export class WalletController {
  constructor(private walletService: WalletService) {}
  
  @Post('send')
  async send(@Body() dto: SendCryptoDto) {
    return this.walletService.sendCrypto(dto);
  }
}

// Service: Orchestration, business logic
@Injectable()
export class WalletService {
  constructor(
    private seedManager: SeedManager,
    private accountFactory: AccountFactory,
  ) {}
  
  async sendCrypto(dto: SendCryptoDto) {
    const seed = await this.seedManager.getSeed(dto.userId);
    const account = await this.accountFactory.createAccount(seed, dto.chain);
    return account.send(dto.to, dto.amount);
  }
}

// Manager: Focused business logic (seed, address, nonce management)
// Repository: Database access (Prisma)
```

### Factory Pattern for Account Creation
- `AccountFactory`: Creates WDK-based accounts (EVM/BTC/Solana/Tron)
- `NativeEoaFactory`: Creates native EOA wallets (non-ERC-4337)
- `Eip7702AccountFactory`: Creates EIP-7702 gasless smart accounts
- `AptosAccountFactory`: Custom Aptos account implementation

All factories accept `(seedPhrase, chain, accountIndex?)` and return `IAccount` interface with `getAddress()`, `getBalance()`, `send()` methods.

### Gas Sponsorship (Pimlico Integration)
ERC-4337 and EIP-7702 transactions use Pimlico for gas sponsorship:
- `PimlicoService`: Bundler/paymaster operations
- `PimlicoConfigService`: Chain-specific bundler URLs
- Supported chains listed in `SMART_ACCOUNT_CHAIN_KEYS` (Ethereum, Base, Arbitrum, Polygon, Avalanche)

## Frontend Patterns

### API Communication
All backend calls go through `apps/web/lib/api.ts`:
```typescript
import { walletApi } from '@/lib/api';

// Example: Send transaction
const result = await walletApi.sendCrypto({
  userId: fingerprint,
  chain: 'ethereum',
  amount: '1000000000000000000', // Wei
  recipientAddress: '0x...'
});
```

### Component Structure
```
components/
  dashboard/
    modals/         # Client components with 'use client'
    ui/             # Reusable UI elements
    balance/        # Balance display components
    wallet/         # Wallet card components
  providers.tsx     # React Query + context providers
```

### State Management
- **WalletDataContext** (`contexts/wallet-data-context.tsx`): Global wallet state (balances, transactions, addresses)
- **LocalStorage**: Caches balances with timestamps to reduce API calls (5min TTL)
- **React Query**: Not currently used, but available for server state

### Server vs Client Components
**Use Server Components (default) for:**
- Static layouts, pages
- Data fetching that doesn't need client state
- SEO-critical content

**Use Client Components (`'use client'`) ONLY for:**
- Hooks (useState, useEffect, useContext)
- Browser APIs (localStorage, window)
- Interactive UI (modals, forms, buttons with onClick)

## Environment Variables

### Backend (apps/backend/.env)
```bash
DATABASE_URL=postgresql://...
WALLET_ENC_KEY=<32-byte base64 key>
JWT_SECRET=<random string>
GOOGLE_CLIENT_ID=<oauth>
GOOGLE_CLIENT_SECRET=<oauth>
PIMLICO_API_KEY=<bundler key>
ZERION_API_KEY=<portfolio API>
```

### Frontend (apps/web/.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001  # Points to backend
```

## Deployment Architecture

**Production Setup:**
- Frontend: Vercel (Next.js SSR + Edge)
- Backend: Railway (NestJS + PostgreSQL)
- Deployment: `railway.json` defines build/start commands

**Build Command (Railway):**
```bash
pnpm install --frozen-lockfile && pnpm run build:backend
```

**Start Command:**
```bash
cd apps/backend && pnpm run start:prod  # Runs migrations + starts server
```

## Code Style Conventions

### TypeScript
- Use `interface` over `type` for objects
- Avoid enums - use union types or const objects
- Descriptive variable names with auxiliary verbs (`isLoading`, `hasError`)

### File Naming
- Directories: lowercase-with-dashes (`wallet-connect`, `auth-wizard`)
- Files: kebab-case with `.service.ts`, `.controller.ts`, `.module.ts` suffixes
- Components: PascalCase for React, kebab-case for file names

### Import Organization
1. External libraries
2. Internal `@repo/*` packages
3. Relative imports (controllers/services/utils)
4. Type-only imports last

## Critical: Never Do This

❌ Store private keys in database
❌ Log seed phrases or private keys
❌ Use `require()` in backend (ESM only - use `import`)
❌ Forget `.js` extension in backend imports
❌ Add `'use client'` to Next.js layout files
❌ Access Prisma client directly in controllers (use services/repositories)
❌ Hard-code chain IDs or RPC URLs (use `ChainConfigService`)
❌ Skip DTO validation decorators (`@IsString()`, `@IsOptional()`, etc.)

## Key Files Reference

**Backend Entry Points:**
- `apps/backend/src/main.ts` - NestJS bootstrap
- `apps/backend/src/app.module.ts` - Root module
- `apps/backend/src/wallet/wallet.service.ts` - Main wallet orchestration (3400+ lines)

**Frontend Entry Points:**
- `apps/web/app/layout.tsx` - Root layout
- `apps/web/app/dashboard/page.tsx` - Main dashboard
- `apps/web/contexts/wallet-data-context.tsx` - Global wallet state

**Shared Types:**
- `packages/types/src/index.ts` - DTOs used by both frontend/backend

**Configuration:**
- `turbo.json` - Build pipeline config
- `apps/backend/prisma/schema.prisma` - Database schema
- `apps/web/next.config.js` - Next.js config

## Recent Notable Implementations

- **EIP-7702 Gasless Wallets**: `wallet/factories/eip7702-account.factory.ts` - Smart account delegation for gas sponsorship
- **Substrate Integration**: `wallet/substrate/` - Full Polkadot parachain support with sr25519 keys
- **Aptos Multi-Network**: `wallet/aptos/` - Testnet/mainnet with BIP-44 derivation
- **Lightning Network Channels**: `lightning-node/` - Yellow Network Nitrolite integration
- **WalletConnect v2**: `walletconnect/` module for dApp connections

When implementing new features, follow the established module pattern (see Aptos/Substrate examples) and prioritize security (never expose keys, always validate inputs, use DTOs).
