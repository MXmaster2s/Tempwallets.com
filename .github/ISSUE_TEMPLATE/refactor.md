---
name: "♻️ Code Refactor & Optimization"
about: "Refactor existing code towards clean, modular, clean architecture principles"
title: "[REFACTOR] "
labels: refactor, enhancement, technical-debt
assignees: ''
---

## 🎯 Summary

<!-- 
  Brief description of what needs refactoring and why
  Example: "Extract wallet resolution logic from LightningNodeService into dedicated service"
  Example: "Split channel-service.ts (1751 lines) into domain-specific modules"
-->

**What:** 
**Why:** 
**Priority:** <!-- High / Medium / Low -->

---

## 📍 Current State

### Files / Modules Involved

<!-- List all files that need refactoring with their current line counts -->
- [ ] `apps/backend/src/...` (XXX lines)
- [ ] `apps/backend/src/...` (XXX lines)

### Architecture Problems

Select all that apply:

- [ ] **God File** - Single file exceeds 500 lines (Yellow: should stay under 400)
- [ ] **God Service** - One class handles 5+ unrelated concerns
- [ ] **Mixed Responsibilities** - Business logic mixed with infrastructure/framework code
- [ ] **Tight Coupling** - Classes directly instantiate dependencies (no DI)
- [ ] **Poor Layer Separation** - Domain logic in controllers, database calls in domain
- [ ] **Circular Dependencies** - Module A imports B imports A
- [ ] **Inconsistent Naming** - Files don't match their main export
- [ ] **Missing Abstractions** - Concrete implementations everywhere, no interfaces
- [ ] **Performance Issues** - N+1 queries, inefficient algorithms, memory leaks
- [ ] **Dead Code** - Unused imports, commented code, unreachable functions

### Specific Issues

<!-- Describe the specific problems in detail with code examples -->

```typescript
// Example of current problematic code
// Explain what makes this code problematic
```

**Current Pain Points:**
1. **Testing:** <!-- e.g., "Can't test wallet logic without mocking entire database" -->
2. **Maintenance:** <!-- e.g., "Changing channel logic breaks session authentication" -->
3. **Understanding:** <!-- e.g., "Unclear where custody deposit logic should go" -->

---

## 🏗️ Target Architecture

### Clean Architecture Layers

We follow **Clean Architecture** principles with these layers (outer depends on inner):

```
┌─────────────────────────────────────────────────────┐
│ Presentation Layer (apps/backend/src/presentation) │
│   - HTTP Controllers                                 │
│   - DTOs, Request/Response mappers                   │
│   - Depends on: Application                          │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│ Application Layer (apps/backend/src/application)    │
│   - Use Cases (orchestrate domain logic)             │
│   - Application Services                             │
│   - Depends on: Domain, Infrastructure (interfaces)  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│ Domain Layer (apps/backend/src/domain)              │
│   - Entities, Value Objects                          │
│   - Domain Services                                  │
│   - Business Rules & Validation                      │
│   - NO external dependencies                         │
└──────────────────────────────────────────────────────┘
                       ▲
┌──────────────────────┴──────────────────────────────┐
│ Infrastructure (apps/backend/src/infrastructure)    │
│   - Database repositories                            │
│   - External API clients (Yellow, Pimlico, Zerion)  │
│   - Blockchain clients (Viem, WDK)                   │
│   - Implements interfaces from Domain/Application    │
└──────────────────────────────────────────────────────┘
```

### Module Structure for This Refactor

<!-- Define the new module boundaries -->

**Example for Yellow Network App Session:**

```
src/
├── domain/
│   └── app-session/
│       ├── entities/
│       │   ├── app-session.entity.ts      # Core AppSession entity
│       │   ├── participant.entity.ts      # Participant value object
│       │   └── allocation.entity.ts       # Allocation value object
│       ├── services/
│       │   └── app-session-domain.service.ts  # Domain logic only
│       └── interfaces/
│           └── app-session.repository.interface.ts
│
├── application/
│   └── app-session/
│       ├── use-cases/
│       │   ├── create-app-session.use-case.ts
│       │   ├── add-participant.use-case.ts
│       │   └── allocate-funds.use-case.ts
│       └── dto/
│           ├── create-app-session.dto.ts
│           └── add-participant.dto.ts
│
├── infrastructure/
│   ├── database/
│   │   └── repositories/
│   │       └── app-session.repository.ts  # Prisma implementation
│   └── yellow-network/
│       ├── yellow-sdk.client.ts           # Yellow SDK wrapper
│       └── state-channel.client.ts        # Nitrolite client
│
└── presentation/
    └── http/
        └── app-session/
            ├── app-session.controller.ts
            ├── app-session.module.ts
            └── mappers/
                └── app-session.mapper.ts
```

### Single Responsibility Per Module

Each module should have **ONE clear responsibility**:

- ✅ `wallet-resolution.service.ts` - ONLY resolves wallet addresses
- ✅ `session-key-auth.service.ts` - ONLY manages session key authentication
- ✅ `app-session.repository.ts` - ONLY handles database CRUD for app sessions
- ✅ `yellow-sdk.client.ts` - ONLY communicates with Yellow SDK
- ❌ `lightning-node.service.ts` - Does wallet + auth + database + SDK + business logic (BAD)

### Dependency Flow

```
Presentation → Application → Domain
                ↓
          Infrastructure
```

**Rules:**
- Domain has NO dependencies on other layers
- Application depends on Domain (and Infrastructure interfaces)
- Infrastructure implements Domain/Application interfaces
- Presentation depends on Application only

---

## 📐 Design & Naming Guidelines

### File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Entity | `{name}.entity.ts` | `app-session.entity.ts` |
| Value Object | `{name}.value-object.ts` | `participant.value-object.ts` |
| Domain Service | `{domain}.service.ts` | `channel-validation.service.ts` |
| Use Case | `{verb}-{noun}.use-case.ts` | `create-app-session.use-case.ts` |
| Repository | `{entity}.repository.ts` | `app-session.repository.ts` |
| Controller | `{resource}.controller.ts` | `app-session.controller.ts` |
| DTO | `{action}-{resource}.dto.ts` | `create-app-session.dto.ts` |
| Mapper | `{resource}.mapper.ts` | `app-session.mapper.ts` |
| Client | `{service}.client.ts` | `yellow-sdk.client.ts` |

### Class Naming Conventions

```typescript
// ✅ GOOD: Descriptive, single responsibility
export class AppSessionService { }          // Domain service
export class CreateAppSessionUseCase { }    // Use case
export class AppSessionRepository { }       // Repository
export class AppSessionController { }       // Controller
export class YellowSdkClient { }            // External client

// ❌ BAD: Generic, unclear responsibility
export class LightningNodeService { }       // What does it do exactly?
export class Helper { }                     // Too generic
export class Utils { }                      // Not a class responsibility
export class Manager { }                    // What does it manage?
```

### Method Naming Conventions

```typescript
// ✅ GOOD: Verb-based, clear intent
async createAppSession(...)         // Creates new session
async addParticipant(...)           // Adds participant
async getAllocatedBalance(...)      // Retrieves balance
private validateAllocation(...)     // Validates data

// ❌ BAD: Unclear, ambiguous
async handle(...)                   // Handle what?
async process(...)                  // Process what?
async doStuff(...)                  // Not descriptive
```

### File Size Limits

- **Maximum:** 400 lines per file (hard limit: 500)
- **Ideal:** 100-250 lines per file
- **If exceeding:** Extract to separate modules

### Checklist: No God Files

- [ ] No file exceeds 400 lines
- [ ] Each class has ONE clear responsibility
- [ ] Each file exports ONE main class/interface
- [ ] Related functionality grouped in directory, not single file
- [ ] Shared utilities in dedicated `/utils` or `/helpers` directory

---

## 📋 Refactor Plan

<!-- High-level steps for the refactor - customize per issue -->

### Phase 1: Analysis & Planning
- [ ] Identify all responsibilities in current code
- [ ] Map current code to target architecture layers
- [ ] List all dependencies that need to be injected
- [ ] Identify breaking changes (if any)

### Phase 2: Create New Structure
- [ ] Create domain entities/value objects
- [ ] Create domain service interfaces
- [ ] Create use case classes
- [ ] Create infrastructure implementations

### Phase 3: Migration
- [ ] Update module imports/exports
- [ ] Migrate controller to use new use cases
- [ ] Update dependency injection in modules
- [ ] Remove old service file(s)

### Phase 4: Testing & Verification
- [ ] Update unit tests for each layer
- [ ] Add integration tests for use cases
- [ ] Update e2e tests if needed
- [ ] Verify no breaking changes to API contracts

### Phase 5: Cleanup
- [ ] Remove dead code
- [ ] Remove unused imports
- [ ] Update documentation
- [ ] Run linter and fix issues

---

## ✅ Acceptance Criteria

### Code Quality
- [ ] No file exceeds 400 lines
- [ ] Each class has a single, clear responsibility
- [ ] All dependencies injected via constructor (NestJS @Inject)
- [ ] No circular dependencies
- [ ] Consistent naming following conventions above

### Architecture
- [ ] Domain layer has no infrastructure dependencies
- [ ] Use cases orchestrate domain + infrastructure
- [ ] Controllers only handle HTTP concerns (routing, DTOs, responses)
- [ ] Infrastructure implements defined interfaces

### Testing
- [ ] All new modules have unit tests (>80% coverage)
- [ ] Use cases tested with mocked dependencies
- [ ] Integration tests updated and passing
- [ ] E2E tests passing

### Documentation
- [ ] JSDoc comments on public methods
- [ ] README.md updated if module structure changed
- [ ] Architecture diagram updated (if applicable)

### API Compatibility
- [ ] No breaking changes to REST API endpoints (unless explicitly stated)
- [ ] Response formats unchanged (unless explicitly stated)
- [ ] Backward compatibility maintained

### Performance
- [ ] No regression in response times
- [ ] No new N+1 query patterns
- [ ] Memory usage stable or improved

---

## 📚 Related Documentation

<!-- Link to relevant docs in the project -->
- [Clean Architecture Guide](../Docs/24CLEAN_ARCHITECTURE_AND_CODE_STRUCTURE.md)
- [Implementation Examples](../Docs/25CLEAN_ARCHITECTURE_IMPLEMENTATION.md)
- [Quick Start Guide](../Docs/26QUICK_START_NEW_ARCHITECTURE.md)

---

## 💡 Example Issue

<details>
<summary>Click to see a complete example</summary>

### Summary
**What:** Refactor `lightning-node.service.ts` (1843 lines) into clean architecture modules
**Why:** God service with mixed responsibilities makes testing/maintenance impossible
**Priority:** High

### Current State

**Files:**
- [ ] `apps/backend/src/lightning-node/lightning-node.service.ts` (1843 lines)

**Problems:**
- [x] God Service - handles 12 different responsibilities
- [x] Mixed Responsibilities - wallet + database + SDK + business logic
- [x] Poor Layer Separation - domain logic mixed with infrastructure

```typescript
// Current: Everything in one service
@Injectable()
export class LightningNodeService {
  // Wallet logic
  private async getUserWalletAddress(userId: string, chainName: string) { }
  
  // Database logic
  private async syncRemoteSessionToLocalDB(...) { }
  
  // SDK client management
  private async getUserNitroliteClient(...) { }
  
  // Business logic
  async create(dto: CreateLightningNodeDto) { }
  async deposit(dto: DepositFundsDto) { }
}
```

### Target Architecture

```
src/
├── domain/
│   └── app-session/
│       ├── app-session.entity.ts
│       └── app-session.service.ts (domain logic only)
├── application/
│   └── app-session/
│       └── use-cases/
│           ├── create-app-session.use-case.ts
│           └── allocate-funds.use-case.ts
├── infrastructure/
│   ├── wallet/
│   │   └── wallet-resolution.service.ts
│   ├── yellow-network/
│   │   └── yellow-sdk.client.ts
│   └── database/
│       └── app-session.repository.ts
└── presentation/
    └── http/
        └── app-session/
            └── app-session.controller.ts
```

### Refactor Plan

**Phase 1: Extract Wallet Resolution**
- [ ] Create `wallet-resolution.service.ts`
- [ ] Move wallet address logic
- [ ] Update tests

**Phase 2: Extract Yellow SDK Client**
- [ ] Create `yellow-sdk.client.ts`
- [ ] Move SDK initialization and calls
- [ ] Update tests

**Phase 3: Create Use Cases**
- [ ] `create-app-session.use-case.ts`
- [ ] `allocate-funds.use-case.ts`
- [ ] Update controller to use new use cases

**Phase 4: Cleanup**
- [ ] Delete old `lightning-node.service.ts`
- [ ] Update module imports
- [ ] Run full test suite

</details>

---

## 🏷️ Labels

Add appropriate labels:
- `refactor` - Always required
- `enhancement` - Improves code quality
- `technical-debt` - Pays down existing debt
- `high-priority` / `medium-priority` / `low-priority`
- `breaking-change` - If API changes required
- Area labels: `yellow-network`, `wallet`, `auth`, `database`, etc.
