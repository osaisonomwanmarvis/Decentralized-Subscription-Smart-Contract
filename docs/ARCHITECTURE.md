# System Architecture

> **SubscriptionPlatform Smart Contract** — Enterprise-grade architecture documentation for developers and technical evaluators.

---

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [Contract Inheritance & Dependencies](#contract-inheritance--dependencies)
- [Data Architecture](#data-architecture)
- [Core Subsystems](#core-subsystems)
- [Payment Flow Architecture](#payment-flow-architecture)
- [State Machine: Subscription Lifecycle](#state-machine-subscription-lifecycle)
- [Access Control Model](#access-control-model)
- [Storage Layout & Gas Considerations](#storage-layout--gas-considerations)
- [Event Architecture](#event-architecture)
- [Upgrade Considerations](#upgrade-considerations)

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SubscriptionPlatform.sol                      │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │   Creator    │  │ Subscription │  │   Platform Admin       │ │
│  │  Management  │  │   Engine     │  │   Controls             │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬─────────────┘ │
│         │                 │                      │               │
│  ┌──────▼───────────────────▼──────────────────────▼───────────┐ │
│  │                    Core State Layer                          │ │
│  │   Mappings | Structs | Analytics | History                  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │              OpenZeppelin Security Layer                      │ │
│  │   ReentrancyGuard | Ownable2Step | SafeERC20                │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

The contract is a **single-file, non-upgradeable** deployment designed for maximum security and auditability. All state is self-contained with no external dependency on oracles, bridges, or proxy patterns.

---

## Contract Inheritance & Dependencies

```
SubscriptionPlatform
    ├── ReentrancyGuard (OpenZeppelin ^4.8.0)
    │     └── Prevents reentrancy on all fund-moving functions
    └── Ownable2Step (OpenZeppelin ^4.8.0)
          └── Two-step ownership transfer for safety
              └── Ownable (base)
```

**External interfaces used:**
- `IERC20` — standard token interface for payment acceptance
- `SafeERC20` — safe wrapper preventing silent transfer failures

**Why Ownable2Step instead of Ownable?**
Ownable2Step requires the new owner to *accept* ownership explicitly, preventing accidental transfers to wrong addresses — a critical protection for contracts handling creator payments.

---

## Data Architecture

### Primary Mappings

```solidity
// Subscription expiry tracking: creator → user → timestamp
mapping(address => mapping(address => uint256)) public creatorSubscriptions;

// Role tracking
mapping(address => bool) public creators;

// Subscription plans per creator (up to MAX_TIERS = 10)
mapping(address => SubscriptionPlan[]) public creatorTiers;

// Analytics per creator
mapping(address => CreatorAnalytics) public creatorAnalytics;

// Transaction history per user (capped at MAX_HISTORY_RECORDS = 100)
mapping(address => SubscriptionRecord[]) public subscriptionHistory;

// Auto-renewal flags: creator → user → bool
mapping(address => mapping(address => bool)) public autoRenewal;

// ERC20 whitelist
mapping(address => bool) public whitelistedTokens;

// Suspended subscriptions: creator → user → stored expiry
mapping(address => mapping(address => uint256)) public suspendedSubscriptions;

// What tier a user is on per creator: user → creator → tierIndex
mapping(address => mapping(address => uint256)) public userTierIndex;

// Active subscription list per user: user → [creator addresses]
mapping(address => address[]) public userActiveSubscriptions;
```

### Core Structs

**SubscriptionPlan** — Defines a single pricing tier:
```solidity
struct SubscriptionPlan {
    uint256 fee;        // ETH price in wei
    uint256 tokenFee;   // ERC20 price in token's native decimals
    uint256 duration;   // Access period in seconds (86400–31536000)
    string metadata;    // Plan name/description (max 256 bytes)
    string benefits;    // Feature list (max 512 bytes)
    bool active;        // Can new users subscribe?
}
```

**SubscriptionRecord** — Immutable audit trail entry:
```solidity
struct SubscriptionRecord {
    address user;
    address creator;
    uint256 tierIndex;
    uint256 startTime;
    uint256 endTime;
    uint256 amountPaid;
    address paymentToken;  // address(0) = ETH payment
}
```

**CreatorAnalytics** — Packed for gas efficiency:
```solidity
struct CreatorAnalytics {
    uint128 totalEarningsETH;      // Packed into single slot with below
    uint128 totalEarningsTokens;
    uint32  totalSubscribers;      // Lifetime unique subscriber count
}
```

> **Storage packing note:** `totalEarningsETH` (128 bits) + `totalEarningsTokens` (128 bits) = 256 bits = 1 storage slot. `totalSubscribers` uses uint32 (max ~4.29 billion subscribers), fitting into the next slot alongside future fields.

---

## Core Subsystems

### 1. Creator Management

Creators are whitelisted addresses permitted to publish subscription plans. The platform owner controls who becomes a creator.

```
Owner
  └── addCreator(address)    → grants creator role
  └── removeCreator(address) → revokes role + purges all tiers & analytics
```

Once added, creators independently manage their own plans. The owner cannot modify creator plans — only creators control their own tier configurations.

### 2. Subscription Engine

The subscription engine handles the full lifecycle through three entry points:

```
subscribe()            → ETH payment path
subscribeWithToken()   → ERC20 payment path
processAutoRenewals()  → Owner-triggered batch renewal (off-chain triggered)
```

Both payment paths converge into `_processSubscription()` — a single internal function that:
1. Calculates new expiry (extends existing subscription if still active)
2. Updates `userTierIndex` for renewal tracking
3. Increments analytics if first-time subscriber
4. Maintains `userActiveSubscriptions` list
5. Appends to `subscriptionHistory` (with FIFO eviction at cap)

### 3. Fee Distribution

**Fees are distributed atomically at subscription time** — the contract holds no creator earnings. This is a critical design choice:

```
User Payment (100%)
    ├── Creator Share (95%) → pushed directly to creator address
    └── Platform Fee (5%)  → pushed directly to owner address
```

Both transfers happen in the same transaction. If either fails, the entire transaction reverts. This means:
- Zero counterparty risk for creators
- No withdrawal step required
- No creator balance tracking needed

### 4. Suspension / Reactivation System

Suspensions allow users to pause their subscription without cancelling:

```
Active Subscription (expiry stored in creatorSubscriptions)
    │
    ▼ suspendSubscription()
    │
Suspended State (expiry moved to suspendedSubscriptions, creatorSubscriptions = 0)
    │
    ├── reactivateSubscription() → restore expiry to creatorSubscriptions
    └── cancelSuspendedSubscription() → delete record entirely
```

**Key behaviour:** Suspended subscriptions retain their original expiry. If a subscription expires while suspended, reactivation succeeds but `_isSubscriptionActive()` returns false — the subscription effectively becomes cancelled on reactivation check.

---

## Payment Flow Architecture

### ETH Payment Flow

```
User calls subscribe(creator, tierIndex) with msg.value
    │
    ├── Validate: creator exists, tier valid, plan active, duration valid
    ├── Validate: msg.value >= plan.fee
    │
    ├── _calculateFees(plan.fee)
    │       platformFee = fee * 500 / 10000  (5%)
    │       creatorShare = fee - platformFee  (95%)
    │
    ├── _distributeETHFees(creator, creatorShare, platformFee)
    │       creator.call{value: creatorShare}  → direct push
    │       owner().call{value: platformFee}   → direct push
    │       emit FeesDistributed
    │
    ├── _processSubscription(...)  → update state
    │
    └── Refund excess: if msg.value > plan.fee → return difference
```

### ERC20 Payment Flow

```
User calls subscribeWithToken(creator, tierIndex, token)
    │
    ├── Validate: all conditions + token whitelisted
    ├── Check allowance via hasSufficientAllowance modifier
    │
    ├── _calculateFees(plan.tokenFee)
    │
    ├── _distributeTokenFees(creator, token, ...)
    │       token.safeTransferFrom(user → creator, creatorShare)
    │       token.safeTransferFrom(user → owner, platformFee)
    │       emit FeesDistributed
    │
    └── _processSubscription(...)  → update state
```

> **Note:** ERC20 payments use `transferFrom` (user → recipient directly), not a deposit-then-distribute pattern. This avoids the contract holding tokens and eliminates a withdrawal step.

---

## State Machine: Subscription Lifecycle

```
         ┌─────────────────────────────────────────┐
         │              NO SUBSCRIPTION             │
         └──────────────────┬──────────────────────┘
                            │
              subscribe() / subscribeWithToken()
                            │
         ┌──────────────────▼──────────────────────┐
         │            ACTIVE SUBSCRIPTION           │
         │  creatorSubscriptions[c][u] > block.time │
         └────┬──────────────────────────┬──────────┘
              │                          │
    suspendSubscription()         block.time > expiry
              │                          │
         ┌────▼──────────────┐  ┌────────▼─────────────────────┐
         │    SUSPENDED      │  │   GRACE PERIOD (7 days)       │
         │ (expiry stored in │  │  still "active" per contract  │
         │  suspendedSubs)   │  └────────┬─────────────────────┘
         └────┬────────┬─────┘           │
              │        │         block.time > expiry + gracePeriod
   reactivate │  cancel│                 │
              │        │       ┌─────────▼──────────────────┐
              │        └──────►│         EXPIRED             │
              │                └─────────────────────────────┘
              │
    ┌─────────▼───────────┐
    │ ACTIVE (restored)   │
    └─────────────────────┘
```

### Grace Period Behaviour

`_isSubscriptionActive()` returns `true` if:
```
expiry > block.timestamp
OR
(expiry + 7 days > block.timestamp AND expiry != 0)
```

This 7-day grace period is **configurable** by the owner via the `gracePeriod` state variable (not exposed via setter in v1.0 — add `updateGracePeriod()` as a customization).

---

## Access Control Model

| Action | Permitted By |
|---|---|
| Add/remove creators | Owner only |
| Update subscription plans | Creator only (own plans) |
| Toggle plan active status | Creator only |
| Subscribe/manage subscription | Any user |
| Update platform fee | Owner only |
| Whitelist/remove tokens | Owner only |
| Pause/unpause contract | Owner only |
| Withdraw ETH/tokens | Owner only |
| Emergency withdraw all | Owner only |
| Process auto-renewals | Owner only |
| Transfer ownership | Owner → pending → accept |

**Custom error-based access control** (gas-efficient vs string reverts):
- `NotOwner()` — triggered by `onlyOwner` modifier
- `NotCreator()` — triggered by `onlyCreator` modifier
- `ContractPaused()` — triggered by `notPaused` modifier
- `PendingOwnerOnly()` — triggered in `acceptOwnership()`

---

## Storage Layout & Gas Considerations

### Slot Packing (CreatorAnalytics)

```
Slot N:   [totalEarningsETH: uint128][totalEarningsTokens: uint128]  = 32 bytes
Slot N+1: [totalSubscribers: uint32][...padding...]                  = 32 bytes
```

This packs two uint128 values into a single SLOAD/SSTORE operation.

### History Record Eviction

`subscriptionHistory` is capped at `MAX_HISTORY_RECORDS = 100`. When full, the oldest record is removed via an O(n) shift — this is acceptable given the 100-record cap but should be noted for gas estimation on heavy users.

### Active Subscription List

`userActiveSubscriptions` uses swap-and-pop for O(1) deletion:
```solidity
// O(1) removal — order not preserved
userActiveSubscriptions[user][i] = userActiveSubscriptions[user][last];
userActiveSubscriptions[user].pop();
```

### String Storage

Metadata and benefits are stored as calldata strings on-chain. For high-frequency updates or very long strings, consider emitting strings only in events and storing a bytes32 hash on-chain (customization opportunity).

---

## Event Architecture

All significant state changes emit events. Events serve as:
1. **Off-chain indexing** — subgraph/event listeners for dashboards
2. **Audit trail** — immutable log of all platform activity
3. **Gas optimization** — avoids on-chain iteration by allowing off-chain query

### Key Event Groups

**Subscription Events**
```solidity
Subscribed(user, creator, tierIndex, expiry)
SubscribedWithToken(user, creator, tierIndex, expiry)
SubscriptionSuspended(user, creator, expiry)
SubscriptionReactivated(user, creator, expiry)
SubscriptionCancelled(user, creator)
```

**Financial Events**
```solidity
FeesDistributed(creator, creatorShare, platformFee)
ETHWithdrawn(to, amount)
TokensWithdrawn(token, to, amount)
```

**Platform Events**
```solidity
CreatorAdded(creator)
CreatorRemoved(creator)
PlanUpdated(creator, tierIndex, fee, tokenFee, duration, metadata, benefits)
PlatformFeeUpdated(oldFee, newFee)
TokenWhitelisted(token)
TokenRemovedFromWhitelist(token)
Paused()
Unpaused()
```

---

## Upgrade Considerations

This contract is **intentionally non-upgradeable**. This is a security feature — users can verify the exact code that controls their subscriptions with no risk of silent upgrades.

For teams requiring upgradeability, the included `upgradeable_proxy_system.txt` provides a UUPS proxy pattern implementation that preserves all functionality while adding upgrade capability.

**If you need to upgrade:**
1. Deploy new contract version
2. Migrate creator configurations manually or via migration script
3. Notify users of new contract address
4. Sunset old contract (pause it)

**Data migration approach:**
```javascript
// Read all creator tiers from old contract
const tiers = await oldContract.getCreatorTier(creatorAddr, tierIndex);

// Replay on new contract
await newContract.connect(creator).updateCreatorPlan(
  tierIndex, tiers.fee, tiers.tokenFee, tiers.duration,
  tiers.metadata, tiers.benefits, tiers.active
);
```

---

*Architecture documentation for SubscriptionPlatform v1.0.0*
*Generated from contract audit — last updated with deployment.*
