# Gas Optimization Guide

> **SubscriptionPlatform Smart Contract** — Gas costs, optimization techniques, and deployment considerations for agencies billing clients on production networks.

---

## Table of Contents

- [Gas Cost Reference](#gas-cost-reference)
- [Built-In Optimizations](#built-in-optimizations)
- [Network Selection Guide](#network-selection-guide)
- [Client Cost Estimates](#client-cost-estimates)
- [Further Optimization Opportunities](#further-optimization-opportunities)
- [Gas Profiling Your Deployment](#gas-profiling-your-deployment)

---

## Gas Cost Reference

All estimates below use **Solidity ^0.8.20 with optimizer enabled (200 runs)**. Real costs depend on network congestion — use these as planning figures when scoping client projects.

### Deployment Cost

| Operation | Gas Units | ETH @ 30 gwei | USD @ $3,000 ETH |
|---|---|---|---|
| Contract deployment | ~2,100,000 | 0.063 ETH | ~$189 |
| Constructor execution | ~included | — | — |

> **Agency tip:** Quote clients $250–$400 for deployment to cover gas + buffer. On L2s (Polygon, Arbitrum, Base) this drops to under $2.

### Per-Transaction Costs (User-Facing)

| Function | Gas Units | ETH @ 30 gwei | Notes |
|---|---|---|---|
| `subscribe()` (first time) | ~120,000 | 0.0036 ETH (~$11) | New subscriber path |
| `subscribe()` (renewal) | ~85,000 | 0.00255 ETH (~$8) | Existing subscriber |
| `subscribeWithToken()` (first time) | ~140,000 | 0.0042 ETH (~$13) | ERC20 + approval check |
| `subscribeWithToken()` (renewal) | ~105,000 | 0.00315 ETH (~$9) | |
| `suspendSubscription()` | ~45,000 | 0.00135 ETH (~$4) | |
| `reactivateSubscription()` | ~50,000 | 0.0015 ETH (~$5) | |
| `enableAutoRenewal()` | ~30,000 | 0.0009 ETH (~$3) | |

### Per-Transaction Costs (Creator/Admin-Facing)

| Function | Gas Units | ETH @ 30 gwei | Notes |
|---|---|---|---|
| `updateCreatorPlan()` (new) | ~180,000 | 0.0054 ETH (~$16) | Stores metadata strings |
| `updateCreatorPlan()` (update) | ~95,000 | 0.00285 ETH (~$9) | Overwrites existing |
| `togglePlanStatus()` | ~25,000 | 0.00075 ETH (~$2) | |
| `addCreator()` | ~45,000 | 0.00135 ETH (~$4) | |
| `addWhitelistedToken()` | ~65,000 | 0.00195 ETH (~$6) | |
| `updatePlatformFee()` | ~28,000 | 0.00084 ETH (~$3) | |

> All USD estimates assume ETH = $3,000 and 30 gwei base fee. Adjust for current prices and network. Use [ethgasstation.info](https://ethgasstation.info) for live estimates.

---

## Built-In Optimizations

The contract ships with several gas optimizations already implemented. Here's what they are and why they matter:

### 1. Custom Errors (vs String Reverts)

```solidity
// ❌ Old approach — stores and returns full string (~3000 gas overhead)
require(msg.sender == owner, "Ownable: caller is not the owner");

// ✅ This contract — 4-byte selector only (~300–700 gas saving per revert)
error NotOwner();
if (msg.sender != owner()) revert NotOwner();
```

**Saving:** 300–700 gas per failed transaction. Adds up significantly in high-volume deployments.

### 2. Struct Packing (CreatorAnalytics)

```solidity
struct CreatorAnalytics {
    uint128 totalEarningsETH;      // } Packed into
    uint128 totalEarningsTokens;   // } one 32-byte slot
    uint32  totalSubscribers;      // Next slot
}
```

Reading `totalEarningsETH` and `totalEarningsTokens` together costs **one SLOAD (2,100 gas)** instead of two (4,200 gas). For analytics-heavy dashboards this compounds quickly.

### 3. Swap-and-Pop for Array Deletion

```solidity
// ❌ Shift all elements left — O(n) writes
for (uint i = index; i < arr.length - 1; i++) arr[i] = arr[i+1];
arr.pop();

// ✅ This contract — O(1), order not preserved
arr[index] = arr[arr.length - 1];
arr.pop();
```

Used in `_removeActiveSubscription()`. Saves ~20,000 gas per removal for users with many active subscriptions.

### 4. Direct Fee Distribution (No Intermediate Storage)

```solidity
// ❌ Two-step approach: store → then let creator withdraw
creatorBalance[creator] += creatorShare; // SSTORE
// Later: creator calls withdraw() → another tx

// ✅ This contract: push directly in same transaction
creator.call{value: creatorShare}("");
owner().call{value: platformFee}("");
```

Eliminates one entire transaction for creators and one SSTORE per subscription. Creators never need to "claim" earnings.

### 5. History Cap with FIFO Eviction

```solidity
uint256 public constant MAX_HISTORY_RECORDS = 100;
```

Prevents unbounded array growth that would make future `getSubscriptionHistory()` calls prohibitively expensive. The O(100) shift on eviction is the cost of a bounded guarantee.

### 6. Memory vs Storage for Reads

```solidity
// ✅ Copy struct to memory for multiple reads — one SLOAD instead of many
SubscriptionPlan memory plan = creatorTiers[creator][tierIndex];
if (!plan.active) revert PlanNotActive();
if (plan.duration < 1 days || plan.duration > 365 days) revert InvalidDuration();
if (msg.value < plan.fee) revert InsufficientPayment();
```

Loading the struct into `memory` once and reading multiple fields is cheaper than accessing storage multiple times.

---

## Network Selection Guide

Ethereum mainnet gas costs are significant for subscription businesses. Present this table to clients when advising on network choice:

| Network | Deploy Cost | Subscribe Cost | Best For |
|---|---|---|---|
| **Ethereum Mainnet** | ~$150–400 | ~$8–15 | High-value B2B, DeFi protocols |
| **Polygon** | ~$0.10–0.50 | ~$0.01–0.05 | Consumer apps, high-volume subscriptions |
| **Arbitrum One** | ~$1–5 | ~$0.10–0.50 | Best UX/cost balance, EVM-identical |
| **Base** | ~$0.50–3 | ~$0.05–0.20 | Coinbase ecosystem, low friction |
| **Optimism** | ~$0.50–3 | ~$0.05–0.20 | Similar to Arbitrum |
| **BNB Chain** | ~$1–3 | ~$0.05–0.15 | Asian markets, BSC DeFi users |

**Agency recommendation:** For most clients building consumer-facing subscription platforms, **Arbitrum One or Base** offer the best combination of low costs, EVM compatibility (zero code changes), and ecosystem maturity.

**The contract is chain-agnostic** — deploy to any EVM network by adding the network config to `hardhat.config.js`. No contract modifications required.

---

## Client Cost Estimates

Use these when scoping projects and writing client proposals. These are **annualized user costs** for a typical subscription platform.

### Scenario A: Small Creator Platform (500 subscribers/year)

| Cost Type | Annual Volume | Gas Cost (Arbitrum) | Gas Cost (Ethereum) |
|---|---|---|---|
| New subscriptions | 500 tx | ~$25 | ~$5,500 |
| Renewals | 400 tx | ~$16 | ~$3,200 |
| Suspensions/reactivations | 50 tx | ~$2 | ~$200 |
| Creator plan updates | 10 tx | ~$1 | ~$160 |
| **Total ecosystem gas** | — | **~$44/year** | **~$9,060/year** |

### Scenario B: Mid-Scale Agency Client (5,000 subscribers/year)

| Cost Type | Arbitrum | Ethereum |
|---|---|---|
| Subscriptions + renewals | ~$400 | ~$87,000 |
| Admin operations | ~$20 | ~$2,000 |
| **Total** | **~$420/year** | **~$89,000/year** |

**Key talking point for agencies:** On Arbitrum, a 5,000-subscriber platform spends less than $500/year total on gas across all users. That's the entire infrastructure cost.

---

## Further Optimization Opportunities

These are customizations you can make to reduce gas further for specific client use cases. See `CUSTOMIZATION.md` for implementation details.

### A. Off-Chain Metadata (High Impact for String-Heavy Creators)

**Current behavior:** `metadata` (256 bytes) and `benefits` (512 bytes) are stored on-chain.

**Optimization:** Store only a content hash on-chain, keep full content on IPFS or a CDN.

```solidity
// Instead of:
string metadata;   // up to 256 bytes on-chain

// Use:
bytes32 metadataHash;  // 32 bytes — always one slot
// Full metadata lives at: ipfs://Qm{metadataHash}
```

**Gas saving on `updateCreatorPlan()`:** ~60,000–120,000 gas depending on string length.

### B. Batch Subscribe (High Impact for Agency B2B Clients)

For clients who need to onboard multiple users at once (e.g., corporate license distribution):

```solidity
function batchSubscribe(
    address creator,
    uint256 tierIndex,
    address[] calldata users
) external payable onlyOwner {
    uint256 totalFee = creatorTiers[creator][tierIndex].fee * users.length;
    require(msg.value >= totalFee);
    for (uint i = 0; i < users.length; i++) {
        _processSubscriptionFor(users[i], creator, tierIndex, ...);
    }
}
```

**Gas saving:** ~30% per user vs individual subscriptions (amortizes base transaction cost).

### C. Remove On-Chain Analytics (For Gas-Sensitive Deployments)

`creatorAnalytics` tracks earnings and subscriber counts on-chain. If your client uses a subgraph or off-chain indexer, this is redundant storage cost.

Remove `creatorAnalytics[creator]` updates from `_processSubscription()` to save ~5,000 gas per subscription.

### D. Event-Only History (Aggressive Optimization)

Replace the on-chain `subscriptionHistory` array with event-only logging:

```solidity
// Remove: subscriptionHistory mapping + _pushToHistory() logic
// Keep: emit Subscribed(...) already covers the same data

// Off-chain: index Subscribed events via The Graph
```

**Gas saving:** ~40,000–80,000 gas per subscription (eliminates all history writes). Trade-off: history only queryable via events/subgraph, not via `getSubscriptionHistory()` view function.

---

## Gas Profiling Your Deployment

Before delivering to a client, run a gas profile:

```bash
# Install gas reporter
npm install --save-dev hardhat-gas-reporter

# Run tests with gas report
REPORT_GAS=true npx hardhat test
```

Add to `hardhat.config.js`:
```javascript
gasReporter: {
  enabled: process.env.REPORT_GAS !== undefined,
  currency: "USD",
  coinmarketcap: process.env.CMC_API_KEY, // optional, for USD conversion
  token: "ETH",
  gasPriceApi: "https://api.etherscan.io/api?module=proxy&action=eth_gasPrice",
}
```

**Sample output you'll see:**
```
·------------------------------------|---------------------------|-------------|-----------------------------·
|        Solc version: 0.8.20        ·  Optimizer enabled: true  ·  Runs: 200  ·  Block limit: 30000000 gas  │
·····································|···························|·············|·····························
|  Methods                           ·               25 gwei/gas               ·       3000.00 usd/eth       │
·····················|···············|·············|·············|·············|··············|··············
|  Contract          ·  Method       ·  Min        ·  Max        ·  Avg        ·  # calls     ·  usd (avg)  │
·····················|···············|·············|·············|·············|··············|··············
|  SubscriptionPlatform  subscribe   ·      85000  ·     120000  ·     102500  ·          42  ·       7.69  │
```

Include this output in your client deliverable as proof of optimization.

---

*Gas optimization guide for SubscriptionPlatform v1.0.0*
*Gas estimates are approximate. Always measure against current network conditions before client commitments.*
