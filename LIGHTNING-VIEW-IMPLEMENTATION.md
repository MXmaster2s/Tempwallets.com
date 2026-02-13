# Lightning Node View - Implementation Guide

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [How to Open the Lightning View](#2-how-to-open-the-lightning-view)
3. [API Reference (All Endpoints)](#3-api-reference-all-endpoints)
4. [Frontend API Layer (`lib/api.ts`)](#4-frontend-api-layer)
5. [State Management & Context](#5-state-management--context)
6. [UI Component Hierarchy](#6-ui-component-hierarchy)
7. [Authentication Flow](#7-authentication-flow)
8. [App Session Lifecycle](#8-app-session-lifecycle)
9. [UI States & Error Handling](#9-ui-states--error-handling)
10. [Persistent UI (No Refresh Required)](#10-persistent-ui-no-refresh-required)
11. [Button Actions & Correct States](#11-button-actions--correct-states)
12. [App Session Card Design](#12-app-session-card-design)
13. [Design Principles](#13-design-principles)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                     │
│                                                          │
│  BalanceTransactionsToggle                               │
│    ├── "Balance" tab      → BalanceView                  │
│    ├── "Transactions" tab → RecentTransactions           │
│    └── "Lightning Nodes" tab → LightningNodesProvider    │
│              └── LightningNodesView                      │
│                    ├── AuthenticationBanner               │
│                    ├── LightningNodeCard[] (list)         │
│                    └── LightningNodeDetails (selected)    │
│                                                          │
│  Hooks:                                                  │
│    useLightningNodes()     → auth, sessions, actions     │
│    useAuth()               → userId, isAuthenticated     │
│                                                          │
│  API Layer (lib/api.ts):                                 │
│    lightningNodeApi.*      → /lightning-node/*            │
│    custodyApi.*             → /custody/*                  │
│    channelApi.*             → /channel/*                  │
├──────────────────────────────────────────────────────────┤
│                    Backend (NestJS)                       │
│                                                          │
│  Controllers:                                            │
│    AppSessionController    → /app-session/*               │
│    CustodyController       → /custody/*                   │
│    ChannelController       → /channel/*                   │
│                                                          │
│  Use Cases (Clean Architecture):                         │
│    AuthenticateWalletUseCase                             │
│    CreateAppSessionUseCase                               │
│    QuerySessionUseCase                                   │
│    DiscoverSessionsUseCase                               │
│    UpdateAllocationUseCase                               │
│    CloseSessionUseCase                                   │
│    DepositToCustodyUseCase                               │
│    FundChannelUseCase                                    │
│                                                          │
│  Infrastructure:                                         │
│    YellowNetworkAdapter   → WebSocket → ClearNode        │
│    CustodyContractAdapter → On-chain transactions        │
└──────────────────────────────────────────────────────────┘
```

### Two API Route Families

The backend exposes **two** sets of routes for Lightning Node operations:

| Route Family | Purpose | Used By |
|---|---|---|
| `/app-session/*` | Clean Architecture endpoints (Postman collection) | Direct API calls |
| `/lightning-node/*` | Legacy endpoints with local metadata storage | Frontend `lightningNodeApi` |

The frontend currently uses `/lightning-node/*` routes via `lightningNodeApi`. The Postman collection uses `/app-session/*` routes. Both hit the same Yellow Network backend.

---

## 2. How to Open the Lightning View

The Lightning Node view is accessed **only** by clicking the "Lightning Nodes" tab button in the `BalanceTransactionsToggle` component.

**File:** `apps/web/components/dashboard/balance/balance-transactions-toggle.tsx`

```
┌─────────────────────────────────────────────┐
│  [Balance]  [Transactions]  [Lightning Nodes] │
│                                               │
│         ← Tab content rendered here →         │
│                                               │
└─────────────────────────────────────────────┘
```

**Behavior:**
- Default view is "Balance" on mount
- Clicking "Lightning Nodes" sets `activeView = 'lightningNodes'`
- The `LightningNodesView` is wrapped in a `LightningNodesProvider` context
- Authentication happens **on-demand** (only when Lightning Nodes tab is opened), not on page load
- View state persists within the same browser session (no page refresh needed)
- The selected node ID is persisted to `localStorage` key `tempwallets:lastSelectedLightningNodeId`

---

## 3. API Reference (All Endpoints)

### 3.1 Authentication

**POST `/app-session/authenticate`**
```json
// Request
{ "userId": "string", "chain": "base" }

// Response
{
  "ok": true,
  "authenticated": true,
  "sessionId": "string",
  "walletAddress": "0x...",
  "chain": "base",
  "timestamp": 1234567890,
  "expiresAt": 1234567890,
  "authSignature": "string"
}
```

### 3.2 Unified Balance

**GET `/custody/balance?userId={userId}&chain={chain}`**
```json
// Response
{
  "ok": true,
  "data": {
    "accountId": "string",
    "balances": [
      { "asset": "USDC", "amount": "600000", "locked": "0", "available": "600000" }
    ]
  }
}
```
- `amount` is in smallest units (6 decimals for USDC/USDT → divide by 1e6)
- This is the **off-chain** Yellow Network ledger, NOT on-chain balance

### 3.3 Custody Deposit (On-Chain)

**POST `/custody/deposit`**
```json
// Request
{ "userId": "string", "chain": "base", "asset": "USDC", "amount": "0.1" }

// Response
{
  "ok": true,
  "data": {
    "success": true,
    "approveTxHash": "0x...",
    "depositTxHash": "0x...",
    "chainId": 8453,
    "amount": "100000",
    "asset": "USDC",
    "unifiedBalance": "700000",
    "message": "Successfully deposited..."
  }
}
```
- **Costs gas** (2 on-chain transactions: approve + deposit)
- Timeout: 180 seconds
- Credits the unified balance after Yellow Network indexes

### 3.4 Custody Withdraw (On-Chain)

**POST `/custody/withdraw`**
```json
// Request
{ "userId": "string", "chain": "base", "asset": "USDC", "amount": "0.05" }
```
- **Costs gas** (on-chain transaction)
- Decreases unified balance

### 3.5 Fund Payment Channel

**POST `/channel/fund`**
```json
// Request
{ "userId": "string", "chain": "base", "asset": "USDC", "amount": "0.05" }

// Response
{ "ok": true, "channelId": "string", "message": "string" }
```
- Moves funds from **unified balance** to payment channel
- Prerequisite: Must have deposited to custody first
- Timeout: 120 seconds

### 3.6 Discover Sessions

**GET `/app-session/discover/{userId}?chain={chain}`**
```json
// Response
{
  "ok": true,
  "sessions": [...],
  "count": 3
}
```

### 3.7 Create App Session

**POST `/app-session`**
```json
// Request
{
  "userId": "string",
  "chain": "base",
  "participants": ["0xAddr1", "0xAddr2"],
  "token": "usdc",
  "initialAllocations": [
    { "participant": "0xAddr1", "amount": "0.1" },
    { "participant": "0xAddr2", "amount": "0.1" }
  ]
}

// Response
{
  "ok": true,
  "appSessionId": "string",
  "status": "open",
  "version": 1,
  "participants": [...],
  "allocations": [...]
}
```
- `initialAllocations` items: **only** `participant` + `amount` (no `asset` field)
- Quorum defaults to 51% (majority)
- Timeout: 90 seconds

### 3.8 Query Session

**GET `/app-session/{sessionId}?userId={userId}&chain={chain}`**
```json
// Response
{
  "ok": true,
  "session": {
    "appSessionId": "string",
    "status": "open",
    "version": 3,
    "definition": { "participants": [...], ... },
    "allocations": [...],
    "sessionData": "string"
  }
}
```

### 3.9 Get Session Balances

**GET `/app-session/{sessionId}/balances?userId={userId}&chain={chain}`**
```json
// Response
{
  "ok": true,
  "appSessionId": "string",
  "balances": [...]
}
```

### 3.10 Update Allocations (Transfer / Deposit / Withdraw)

**PATCH `/app-session/{sessionId}`**
```json
// Request
{
  "userId": "string",
  "chain": "base",
  "intent": "OPERATE",          // "OPERATE" | "DEPOSIT" | "WITHDRAW"
  "allocations": [
    { "participant": "0xAddr1", "amount": "0.05", "asset": "USDC" },
    { "participant": "0xAddr2", "amount": "0.15", "asset": "USDC" }
  ]
}

// Response
{
  "ok": true,
  "appSessionId": "string",
  "version": 4,
  "allocations": [...]
}
```

**CRITICAL:** Allocations are the **FINAL desired state**, NOT deltas. The protocol computes the diff internally.

| Intent | Description | Gas? |
|--------|-------------|------|
| `OPERATE` | Transfer between participants within session | Gasless |
| `DEPOSIT` | Move funds from unified balance into session | Gasless |
| `WITHDRAW` | Move funds from session back to unified balance | Gasless |

### 3.11 Close Session

**DELETE `/app-session/{sessionId}?userId={userId}&chain={chain}`**
```json
// Response
{ "ok": true, "closed": true }
```
- Returns funds to unified balance (custody)

---

## 4. Frontend API Layer

**File:** `apps/web/lib/api.ts`

Three API namespaces handle Lightning-related operations:

```typescript
// 1. Custody operations (on-chain)
custodyApi.depositToCustody(data)      // POST /custody/deposit
custodyApi.getUnifiedBalance(params)   // GET  /custody/balance

// 2. Channel operations
channelApi.fundChannel(data)           // POST /channel/fund

// 3. Lightning Node operations (primary frontend API)
lightningNodeApi.authenticateWallet(data)    // POST /lightning-node/authenticate
lightningNodeApi.discoverSessions(userId)    // GET  /lightning-node/discover/{userId}
lightningNodeApi.searchSession(data)         // POST /lightning-node/search
lightningNodeApi.createLightningNode(data)   // POST /lightning-node/create
lightningNodeApi.getLightningNodeById(id)    // GET  /lightning-node/detail/{id}
lightningNodeApi.heartbeatLightningNode()    // POST /lightning-node/presence/{id}/{userId}
lightningNodeApi.fundChannel(data)           // POST /lightning-node/fund-channel
lightningNodeApi.depositFunds(data)          // POST /lightning-node/deposit
lightningNodeApi.transferFunds(data)         // POST /lightning-node/transfer
lightningNodeApi.withdrawFunds(data)         // POST /lightning-node/withdraw
lightningNodeApi.closeLightningNode(data)    // POST /lightning-node/close
```

### Key Types

```typescript
interface LightningNode {
  id: string;
  userId: string;
  appSessionId: string;       // Yellow Network session ID
  uri: string;                // lightning://{appSessionId}
  chain: string;              // 'base' | 'arbitrum' | etc.
  token: string;              // 'USDC'
  status: 'open' | 'closed';
  maxParticipants: number;
  quorum: number;
  protocol: string;           // 'NitroRPC/0.4'
  challenge: number;
  participants: LightningNodeParticipant[];
  transactions?: LightningNodeTransaction[];
  createdAt: string;
  updatedAt: string;
}

interface LightningNodeParticipant {
  id: string;
  address: string;
  weight: number;             // 0-100 voting power
  balance: string;            // Smallest units (divide by 1e6)
  asset: string;
  status?: string;
  joinedAt: string | null;
}

interface UnifiedBalanceEntry {
  asset: string;
  amount: string;             // Smallest units
  locked: string;
  available: string;
}
```

---

## 5. State Management & Context

### Hook: `useLightningNodes` (`hooks/useLightningNodes.ts`)

Central hook managing all Lightning Node state:

```typescript
const {
  // Auth
  authenticated,          // boolean - is wallet authenticated?
  authenticating,         // boolean - auth in progress?
  walletAddress,          // string | null
  authenticate,           // (chain?: string) => Promise<void>

  // Sessions
  allSessions,            // LightningNode[]
  activeSessions,         // LightningNode[] - status === 'open'
  invitations,            // LightningNode[] - pending invitations
  discoverSessions,       // (chain?: string) => Promise<void>
  searchSession,          // (sessionId: string) => Promise<LightningNode | null>

  // Actions
  createNode,             // (data) => Promise<LightningNode | null>
  refreshNodes,           // () => Promise<void>

  // UI State
  loading,                // boolean
  error,                  // string | null
  lastFetched,            // number | null (timestamp)
} = useLightningNodes();
```

### Context: `LightningNodesProvider` (`hooks/lightning-nodes-context.tsx`)

Wraps `LightningNodesView` to provide shared state across all child components:

```tsx
<LightningNodesProvider>
  <LightningNodesView />
</LightningNodesProvider>
```

The provider uses `useMemo` to prevent unnecessary re-renders, only updating when `nodes`, `loading`, `error`, or `lastFetched` change.

### Auth Hook: `useAuth` (`hooks/useAuth.ts`)

Provides `userId` used by all Lightning operations:
- When authenticated with Google SSO: uses Google user ID
- When not authenticated: uses browser fingerprint as fallback

---

## 6. UI Component Hierarchy

```
BalanceTransactionsToggle
│
├── [Balance] tab → BalanceView
├── [Transactions] tab → RecentTransactions
└── [Lightning Nodes] tab
    └── LightningNodesProvider (context)
        └── LightningNodesView
            │
            ├── Loading State (while authenticating)
            │   └── Spinner + "Authenticating wallet..."
            │
            ├── Empty State (no sessions)
            │   ├── AuthenticationBanner
            │   ├── Empty mailbox illustration
            │   ├── "Create / Join Lightning Node" button
            │   ├── CreateLightningNodeModal
            │   └── CustodyDepositModal
            │
            ├── List State (has sessions)
            │   ├── AuthenticationBanner
            │   │   └── "Add to Unified Balance" button
            │   ├── Invitations section
            │   │   └── LightningNodeCard[] (isInvitation=true)
            │   ├── Active Sessions section
            │   │   ├── Header + "Create / Join" button
            │   │   └── LightningNodeCard[]
            │   ├── CreateLightningNodeModal
            │   └── CustodyDepositModal
            │
            └── Detail State (node selected)
                └── LightningNodeDetails
                    ├── Header (chain, token, close button)
                    ├── Balance cards (My Balance / Total Balance)
                    ├── Status badge
                    ├── Session ID (copyable)
                    ├── Share URI (if open + slots available)
                    ├── Action buttons (Deposit/Transfer/Withdraw)
                    ├── Close Node button
                    ├── Participants accordion
                    ├── Transactions accordion
                    └── Modals:
                        ├── CustodyDepositModal
                        ├── DepositFundsModal
                        ├── TransferFundsModal
                        └── WithdrawFundsModal
```

---

## 7. Authentication Flow

```
User clicks "Lightning Nodes" tab
│
├── LightningNodesView mounts
│   └── useEffect → initializeLightningNodes()
│       │
│       ├── if !authenticated && !authenticating:
│       │   ├── authenticate('base')
│       │   │   └── POST /lightning-node/authenticate
│       │   │       └── Creates WebSocket + 3-step auth flow (90s timeout)
│       │   │
│       │   └── discoverSessions('base')
│       │       └── GET /lightning-node/discover/{userId}
│       │           └── Returns active sessions + invitations
│       │
│       └── if authenticated && no sessions loaded:
│           └── discoverSessions('base')
│
└── AuthenticationBanner renders based on state:
    ├── authenticating → Spinner + "Authenticating Wallet"
    ├── error → Error message
    └── authenticated → Wallet address + "Add to Unified Balance" button
```

**Key behaviors:**
- Authentication is **on-demand** (only when Lightning tab is opened)
- `authenticate()` is a no-op if already authenticated
- Session discovery happens after authentication completes
- Auth session has an expiry; re-authentication is automatic

---

## 8. App Session Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│                    FULL LIFECYCLE                              │
│                                                               │
│  1. DEPOSIT TO CUSTODY (on-chain, costs gas)                  │
│     POST /custody/deposit                                     │
│     └── Wallet → Custody Contract → Unified Balance           │
│                                                               │
│  2. AUTHENTICATE                                              │
│     POST /app-session/authenticate                            │
│     └── Creates session key with USDC allowances              │
│                                                               │
│  3. CREATE SESSION                                            │
│     POST /app-session                                         │
│     └── Define participants + initial allocations             │
│                                                               │
│  4. DEPOSIT INTO SESSION (gasless)                            │
│     PATCH /app-session/{id} (intent: "DEPOSIT")               │
│     └── Unified Balance → App Session                         │
│                                                               │
│  5. TRANSFER WITHIN SESSION (gasless, instant)                │
│     PATCH /app-session/{id} (intent: "OPERATE")               │
│     └── Participant A → Participant B (off-chain)             │
│                                                               │
│  6. WITHDRAW FROM SESSION (gasless)                           │
│     PATCH /app-session/{id} (intent: "WITHDRAW")              │
│     └── App Session → Unified Balance                         │
│                                                               │
│  7. CLOSE SESSION                                             │
│     DELETE /app-session/{id}                                  │
│     └── Returns all funds to unified balance                  │
│                                                               │
│  8. WITHDRAW FROM CUSTODY (on-chain, costs gas)               │
│     POST /custody/withdraw                                    │
│     └── Unified Balance → Custody Contract → Wallet           │
└──────────────────────────────────────────────────────────────┘
```

### Balance Flow Diagram

```
On-Chain Wallet
    │
    │ custody/deposit (GAS)
    ▼
Unified Balance (Off-Chain Yellow Ledger)
    │
    │ DEPOSIT intent (GASLESS)
    ▼
App Session Balance
    │
    │ OPERATE intent (GASLESS, INSTANT)
    ▼
Transfer Between Participants
    │
    │ WITHDRAW intent (GASLESS)
    ▼
Unified Balance
    │
    │ custody/withdraw (GAS)
    ▼
On-Chain Wallet
```

---

## 9. UI States & Error Handling

### View States

| State | Condition | What's Shown |
|-------|-----------|--------------|
| **Authenticating** | `authenticating && !authenticated` | Full-page spinner + "Authenticating wallet..." |
| **Auth Failed** | `error && !authenticated` | Error banner with message |
| **Empty** | `authenticated && no sessions && !loading` | Empty mailbox + "Create / Join" CTA button |
| **Session List** | `authenticated && has sessions` | Auth banner + invitation cards + session cards |
| **Session Detail** | `selectedNodeId !== null` | Full node detail view with actions |

### Error Handling Patterns

1. **Auth errors** → Shown in `AuthenticationBanner` (non-blocking)
2. **API errors** → Shown in component-level error states
3. **Modal errors** → Shown inline within modal (red border + message)
4. **Network errors** → Caught by `fetchApi` wrapper, throws `ApiError(503, ...)`
5. **Timeout errors** → Caught by AbortController, throws `ApiError(408, ...)`

### Card Size Consistency

**IMPORTANT:** The `LightningNodeCard` component uses a fixed layout structure that does NOT change when errors occur:

```tsx
// Fixed structure - always renders these sections in order:
<div className="bg-white rounded-2xl p-4 space-y-3 border ...">
  {/* Header with Status - always visible */}
  {/* Balance section - always visible */}
  {/* Participants count - always visible */}
  {/* Session ID - always visible */}
  {/* Share URI - conditionally visible (open + slots) */}
  {/* Footer with date + "View Details" */}
</div>
```

Errors are displayed **above** the card list or inside modals, never inside card bodies. This ensures card dimensions remain stable.

---

## 10. Persistent UI (No Refresh Required)

### State Persistence Mechanisms

1. **React State (in-memory):** All session data, auth state, and UI state live in React hooks. Switching between tabs preserves state because `LightningNodesProvider` stays mounted.

2. **localStorage Persistence:**
   - `tempwallets:lastSelectedLightningNodeId` → Restores the last-opened node after page refresh
   - `auth_token` → Bearer token for authenticated API calls

3. **Optimistic Updates:** When creating/joining a node, the new node is immediately added to the `allSessions` / `activeSessions` state arrays without waiting for a re-discovery:

```typescript
// In createNode():
setAllSessions(prev => [response.node, ...prev]);
setActiveSessions(prev => [response.node, ...prev]);

// In searchSession() (join):
setAllSessions(prev => {
  const exists = prev.some(s => s.appSessionId === ...);
  if (exists) return prev;
  return [response.localMetadata!, ...prev];
});
```

4. **Heartbeat Mechanism:** The `LightningNodeDetails` component sends a presence heartbeat every 30 seconds while the detail view is open:

```typescript
useEffect(() => {
  const sendHeartbeat = async () => {
    await lightningNodeApi.heartbeatLightningNode(appSessionId, userId);
  };
  void sendHeartbeat();
  const timer = setInterval(sendHeartbeat, 30_000);
  return () => clearInterval(timer);
}, [userId, lightningNode?.appSessionId]);
```

5. **Refresh Button:** The toggle header has a refresh button that calls `refreshNodes()` → `discoverSessions()` for explicit manual refresh.

6. **Post-Action Refresh:** After deposit/transfer/withdraw/close operations, the detail view calls `refreshDetails()` to fetch updated node data.

---

## 11. Button Actions & Correct States

### AuthenticationBanner Buttons

| Button | Visible When | Action |
|--------|-------------|--------|
| **Add to Unified Balance** | `authenticated && walletAddress` | Opens `CustodyDepositModal` |

### Empty State Buttons

| Button | Action |
|--------|--------|
| **Create / Join Lightning Node** | Opens `CreateLightningNodeModal` |

### Session List Buttons

| Button | Location | Action |
|--------|----------|--------|
| **Create / Join** | Top-right of "My Lightning Nodes" header | Opens `CreateLightningNodeModal` |
| **Node Card** | Each session card | Sets `selectedNodeId` → navigates to detail view |

### Session Detail Action Buttons

| Button | State | Current Behavior |
|--------|-------|-----------------|
| **Deposit** | `disabled` (Coming Soon) | Tooltip: "Coming soon" |
| **Transfer** | `disabled` (Coming Soon) | Tooltip: "Coming soon" |
| **Withdraw** | `disabled` (Coming Soon) | Tooltip: "Coming soon" |
| **Close Node** | Active (with confirm dialog) | Calls `closeLightningNode()` |
| **X (close)** | Always visible (top-right) | Returns to session list |

### Create Modal Buttons

| Button | Tab | Action |
|--------|-----|--------|
| **Create** | Create tab | Calls `createNode()` with chain + token + participants |
| **Join** | Join tab | Calls `joinNode()` with URI |
| **Cancel** | Both tabs | Closes modal |
| **Done** | After success | Closes modal |
| **Open Lightning Node** | After join success | Calls `onJoined(node)` → navigates to detail |

### Custody Deposit Modal Steps

| Step | UI State | Button |
|------|----------|--------|
| `input` | Form with chain/asset/amount | "Deposit to Custody" |
| `approving` | Spinner + step indicators | "Processing..." (disabled) |
| `depositing` | Spinner + step indicators | "Processing..." (disabled) |
| `indexing` | Spinner + step indicators | "Processing..." (disabled) |
| `success` | Check icon + tx links | "Done" |
| `error` | Error icon + troubleshooting | "Try Again" / "Cancel" |

---

## 12. App Session Card Design

### Card Layout (Fixed Size)

```
┌─────────────────────────────────────────────┐
│  [Icon] Base                    [Open]       │
│         USDC                                 │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ Total Channel Balance                   │ │
│  │ 0.20 USDC                              │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  Participants              2 / 10            │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ Session ID                    [Copy]    │ │
│  │ 0x1234...abcd                           │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │ Share this link               [Copy URI]│ │
│  │ lightning://0x1234...                    │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  Created 2/13/2026         View Details →    │
└─────────────────────────────────────────────┘
```

### Detail View Layout

```
┌──────────────────────────────────────────────┐
│  [Icon] Base                           [X]    │
│         USDC Lightning Node                   │
│                                               │
│  ┌──────────────┐  ┌──────────────┐          │
│  │ My Balance   │  │ Total Balance│          │
│  │ 0.05 USDC    │  │ 0.20 USDC   │          │
│  └──────────────┘  └──────────────┘          │
│                                               │
│  Status                          [Open]       │
│                                               │
│  Session ID                      [Copy]       │
│  0x1234567890abcdef...                        │
│                                               │
│  Share to add participants       [Copy URI]   │
│  lightning://0x1234...                         │
│                                               │
│  ┌────────────┐ ┌────────────┐ ┌───────────┐ │
│  │ + Deposit  │ │ ↔ Transfer │ │ - Withdraw│ │
│  │ (disabled) │ │ (disabled) │ │ (disabled)│ │
│  └────────────┘ └────────────┘ └───────────┘ │
│                                               │
│  [          Close Node (Coming Soon)        ] │
│                                               │
│  ▼ Participants (2/10)                        │
│  ┌───────────────────────────────────────────┐│
│  │ 0x1234ab...cdef1234  [You]     0.05 USDC ││
│  │ Weight: 50% | Joined 2/13/2026           ││
│  ├───────────────────────────────────────────┤│
│  │ 0x5678ef...abcd5678           0.15 USDC  ││
│  │ Weight: 50% | Joined 2/13/2026           ││
│  └───────────────────────────────────────────┘│
│                                               │
│  ▶ Transactions (3)                           │
└──────────────────────────────────────────────┘
```

---

## 13. Design Principles

### Styling

The UI follows the existing Tempwallets design system:

- **Colors:** Monochrome palette (grays, black, white) for all Lightning Node UI
  - Primary actions: `bg-black hover:bg-gray-800 text-white`
  - Status badges: `bg-gray-200 text-gray-800`
  - Borders: `border-gray-200`
  - Background sections: `bg-gray-50`
  - Icons: `text-gray-700`
  - Accent (authenticated badge): `text-gray-700` with `CheckCircle2` icon
- **Font:** `font-rubik-medium` for headings, `font-rubik-normal` for body
- **Rounded corners:** `rounded-xl` for cards, `rounded-2xl` for outer containers, `rounded-full` for badges
- **Spacing:** `space-y-3` between card sections, `gap-3` in grids
- **Shadows:** `shadow-lg shadow-gray-300/50` on primary action buttons

### Component Patterns

1. **Modals** use shadcn `Dialog` component with `sm:max-w-[425px]` or `sm:max-w-[500px]`
2. **Tooltips** use shadcn `Tooltip` with `bg-black/80 text-white` styling
3. **Loading states** use `Loader2` icon with `animate-spin`
4. **Copy buttons** toggle between "Copy" / "Copied!" text with 2-second timeout
5. **Error messages** use `bg-red-50 border-red-200 text-red-700` containers
6. **Success messages** use `bg-green-50 border-green-200 text-green-700` containers
7. **Info messages** use `bg-blue-50 border-blue-200 text-blue-800` containers

### State Management Rules

1. **No page refreshes** - all state transitions happen via React state updates
2. **Optimistic updates** - add nodes to lists immediately after creation/join
3. **On-demand loading** - auth + discovery only when Lightning tab is accessed
4. **localStorage persistence** - selected node ID survives page refreshes
5. **Error resilience** - errors are shown inline, never break the layout
6. **Fixed card dimensions** - errors render outside cards, never inside

### API Integration Rules

1. All API calls go through the `fetchApi` wrapper in `lib/api.ts`
2. Auth tokens are automatically attached from `localStorage('auth_token')`
3. Timeouts vary by operation:
   - Standard: 30s
   - Auth: 90s
   - On-chain operations: 120-180s
   - Network queries: 60s
4. Errors are caught and wrapped in `ApiError` with status codes
5. Response format is always `{ ok: boolean, ...data }`
