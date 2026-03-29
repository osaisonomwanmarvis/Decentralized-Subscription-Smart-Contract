# Function Reference

> **SubscriptionPlatform Smart Contract** — Complete API documentation for all public and external functions.

---

## Table of Contents

- [Function Index](#function-index)
- [Subscription Functions](#subscription-functions)
- [Creator Management Functions](#creator-management-functions)
- [Platform Control Functions](#platform-control-functions)
- [Withdrawal Functions](#withdrawal-functions)
- [View / Read Functions](#view--read-functions)
- [Events Reference](#events-reference)
- [Error Reference](#error-reference)
- [Constants & State Variables](#constants--state-variables)

---

## Function Index

| Function | Visibility | Mutability | Who Can Call |
|---|---|---|---|
| `subscribe()` | external | payable | Anyone |
| `subscribeWithToken()` | external | nonpayable | Anyone |
| `enableAutoRenewal()` | external | nonpayable | Subscriber |
| `disableAutoRenewal()` | external | nonpayable | Subscriber |
| `suspendSubscription()` | external | nonpayable | Subscriber |
| `reactivateSubscription()` | external | nonpayable | Subscriber |
| `cancelSuspendedSubscription()` | external | nonpayable | Subscriber |
| `addCreator()` | external | nonpayable | Owner |
| `removeCreator()` | external | nonpayable | Owner |
| `updateCreatorPlan()` | external | nonpayable | Creator |
| `togglePlanStatus()` | external | nonpayable | Creator |
| `addWhitelistedToken()` | external | nonpayable | Owner |
| `removeWhitelistedToken()` | external | nonpayable | Owner |
| `updatePlatformFee()` | external | nonpayable | Owner |
| `pause()` | external | nonpayable | Owner |
| `unpause()` | external | nonpayable | Owner |
| `transferOwnership()` | public | nonpayable | Owner |
| `acceptOwnership()` | external | nonpayable | Pending Owner |
| `withdrawETH()` | external | nonpayable | Owner |
| `withdrawTokens()` | external | nonpayable | Owner |
| `emergencyWithdrawAll()` | external | nonpayable | Owner |
| `processAutoRenewals()` | external | nonpayable | Owner |
| `isSubscriptionActive()` | external | view | Anyone |
| `getSubscriptionExpiry()` | external | view | Anyone |
| `getCreatorTiersCount()` | external | view | Anyone |
| `getCreatorTier()` | external | view | Anyone |
| `getSubscriptionHistory()` | external | view | Anyone |
| `getUserActiveSubscriptions()` | external | view | Anyone |
| `getActiveSubscriberCount()` | external | view | Anyone |
| `getCreatorAnalytics()` | external | view | Anyone |

---

## Subscription Functions

---

### `subscribe()`

Subscribe to a creator's plan using ETH.

```solidity
function subscribe(
    address creator,
    uint256 tierIndex
) external payable
```

**Parameters**

| Name | Type | Description |
|---|---|---|
| `creator` | `address` | Address of the creator to subscribe to |
| `tierIndex` | `uint256` | Index of the subscription tier (0-based) |

**Requirements**
- Contract must not be paused
- `creator` must not be zero address
- `creator` must be a registered creator
- `tierIndex` must be within bounds of creator's tiers
- Plan at `tierIndex` must be active
- Plan duration must be between 1 and 365 days
- `msg.value` must be ≥ `plan.fee`

**Behaviour**
- Deducts platform fee (default 5%) from `msg.value`
- Sends creator's share directly to creator address
- Sends platform fee directly to owner address
- Extends existing subscription if still active (stackable)
- Refunds excess ETH to caller
- Emits `Subscribed` event

**Reverts**
- `ContractPaused()` — contract is paused
- `InvalidAddress()` — zero address provided
- `InvalidCreator()` — creator not registered
- `InvalidTierIndex()` — tier out of bounds
- `PlanNotActive()` — tier is deactivated
- `InvalidDuration()` — plan duration outside 1-365 days
- `InsufficientPayment()` — msg.value < plan.fee
- `TransferFailed()` — ETH transfer to creator or owner failed

**Example**

```javascript
// Subscribe to creator's tier 0 (Basic plan)
const creatorAddress = "0xCreator...";
const tierIndex = 0;

// Get plan fee first
const plan = await contract.getCreatorTier(creatorAddress, 0);
const fee = plan.fee; // in wei

await contract.subscribe(creatorAddress, 0, {
  value: fee
});
```

---

### `subscribeWithToken()`

Subscribe to a creator's plan using a whitelisted ERC20 token.

```solidity
function subscribeWithToken(
    address creator,
    uint256 tierIndex,
    address token
) external
```

**Parameters**

| Name | Type | Description |
|---|---|---|
| `creator` | `address` | Address of the creator to subscribe to |
| `tierIndex` | `uint256` | Index of the subscription tier (0-based) |
| `token` | `address` | Address of the ERC20 token to pay with |

**Requirements**
- Contract must not be paused
- `creator` and `token` must not be zero addresses
- `creator` must be a registered creator
- `token` must be whitelisted
- Caller must have approved contract for at least `plan.tokenFee`
- All same plan validity requirements as `subscribe()`

**Behaviour**
- Uses `safeTransferFrom` for all token movements
- Transfers creator share directly from caller to creator
- Transfers platform fee directly from caller to owner
- No intermediate holding of tokens

**Important:** You must call `token.approve(contractAddress, tokenFee)` before calling this function.

**Reverts**
- All same as `subscribe()` plus:
- `TokenNotSupported()` — token not in whitelist
- `InsufficientAllowance()` — ERC20 allowance too low

**Example**

```javascript
const USDC = new ethers.Contract(usdcAddress, ERC20_ABI, signer);
const plan = await contract.getCreatorTier(creatorAddress, 0);

// Step 1: Approve token spending
await USDC.approve(contractAddress, plan.tokenFee);

// Step 2: Subscribe
await contract.subscribeWithToken(creatorAddress, 0, usdcAddress);
```

---

### `enableAutoRenewal()`

Enable automatic renewal for an existing subscription.

```solidity
function enableAutoRenewal(address creator) external
```

**Parameters**

| Name | Type | Description |
|---|---|---|
| `creator` | `address` | Creator whose subscription to enable auto-renewal for |

**Requirements**
- Caller must have an active subscription with the creator

**Note:** Setting this flag does not automatically execute renewals. The platform owner must call `processAutoRenewals()` as a keeper function. Consider integrating Chainlink Automation.

**Reverts**
- `InvalidAddress()` — zero address
- `NoActiveSubscription()` — no active subscription exists

**Example**

```javascript
await contract.enableAutoRenewal(creatorAddress);
```

---

### `disableAutoRenewal()`

Disable automatic renewal for a subscription.

```solidity
function disableAutoRenewal(address creator) external
```

**Parameters**

| Name | Type | Description |
|---|---|---|
| `creator` | `address` | Creator whose auto-renewal to disable |

**Note:** Does not require an active subscription. Safe to call even if subscription has expired.

**Example**

```javascript
await contract.disableAutoRenewal(creatorAddress);
```

---

### `suspendSubscription()`

Pause a subscription, preserving the remaining time for later reactivation.

```solidity
function suspendSubscription(address creator) external
```

**Parameters**

| Name | Type | Description |
|---|---|---|
| `creator` | `address` | Creator whose subscription to suspend |

**Behaviour**
- Moves expiry from `creatorSubscriptions` to `suspendedSubscriptions`
- Sets `creatorSubscriptions[creator][user] = 0`
- Removes creator from user's `userActiveSubscriptions` list

**Reverts**
- `AlreadySuspended()` — subscription already suspended
- `NoActiveSubscription()` — no active subscription

---

### `reactivateSubscription()`

Resume a previously suspended subscription.

```solidity
function reactivateSubscription(address creator) external
```

**Behaviour**
- Restores expiry from `suspendedSubscriptions` back to `creatorSubscriptions`
- If the stored expiry is still in the future, re-adds to active subscriptions
- Clears the `suspendedSubscriptions` entry

**Reverts**
- `NoSuspendedSubscription()` — no suspended subscription found

---

### `cancelSuspendedSubscription()`

Permanently cancel a suspended subscription (no refund).

```solidity
function cancelSuspendedSubscription(address creator) external
```

**Behaviour**
- Deletes the suspended subscription record entirely
- Deletes the user's tier index for this creator

**Reverts**
- `NoSuspendedSubscription()` — no suspended subscription to cancel

---

## Creator Management Functions

---

### `addCreator()`

Grant creator role to an address.

```solidity
function addCreator(address creator) external onlyOwner
```

**Parameters**

| Name | Type | Description |
|---|---|---|
| `creator` | `address` | Address to grant creator role |

**Note:** The deploying owner is automatically added as a creator in the constructor.

---

### `removeCreator()`

Revoke creator role and delete all associated data.

```solidity
function removeCreator(address creator) external onlyOwner
```

**⚠️ Warning:** This deletes `creatorTiers` and `creatorAnalytics` for the creator. Existing subscriber records in `subscriptionHistory` are preserved (they're stored under the user, not the creator). Active subscriber expiry times remain in `creatorSubscriptions` but plans are inaccessible.

---

### `updateCreatorPlan()`

Create or update a subscription tier. Called by creators to configure their plans.

```solidity
function updateCreatorPlan(
    uint256 tierIndex,
    uint256 fee,
    uint256 tokenFee,
    uint256 duration,
    string calldata metadata,
    string calldata benefits,
    bool active
) external onlyCreator
```

**Parameters**

| Name | Type | Constraints | Description |
|---|---|---|---|
| `tierIndex` | `uint256` | 0–9 | Tier slot to update (use length for new tier) |
| `fee` | `uint256` | Any (0 = free) | ETH fee in wei |
| `tokenFee` | `uint256` | Any (0 = free) | ERC20 fee in token units |
| `duration` | `uint256` | 86400–31536000 | Subscription length in seconds |
| `metadata` | `string` | 1–256 bytes | Plan name/description |
| `benefits` | `string` | 1–512 bytes | Feature list |
| `active` | `bool` | — | Whether plan accepts new subscribers |

**Behaviour**
- If `tierIndex < currentLength`: updates existing tier
- If `tierIndex == currentLength`: appends new tier
- Cannot skip indices (tier 2 requires tiers 0 and 1 to exist)
- Maximum 10 tiers per creator

**Example**

```javascript
// Create a monthly plan at 0.01 ETH or 20 USDC
await contract.connect(creator).updateCreatorPlan(
    0,                           // tierIndex (0 = first/new tier)
    ethers.parseEther("0.01"),   // ETH fee
    ethers.parseUnits("20", 6),  // 20 USDC (6 decimals)
    30 * 24 * 60 * 60,           // 30 days in seconds
    "Basic Monthly",             // metadata
    "Access to all content, Discord role, Monthly newsletter", // benefits
    true                         // active
);
```

---

### `togglePlanStatus()`

Toggle a plan's active status (active ↔ inactive).

```solidity
function togglePlanStatus(uint256 tierIndex) external onlyCreator
```

**Behaviour**
- Active plans: new subscriptions allowed
- Inactive plans: new subscriptions blocked (`PlanNotActive()`), but existing subscriptions remain valid until expiry

---

## Platform Control Functions

---

### `addWhitelistedToken()`

Add an ERC20 token to the accepted payment tokens list.

```solidity
function addWhitelistedToken(address token) external onlyOwner
```

**Note:** Only add tokens you've reviewed. Malicious tokens can cause issues (see SECURITY.md).

---

### `removeWhitelistedToken()`

Remove an ERC20 token from the whitelist.

```solidity
function removeWhitelistedToken(address token) external onlyOwner
```

**Note:** Existing subscriptions are unaffected. Only prevents new subscriptions with this token.

---

### `updatePlatformFee()`

Update the platform fee percentage.

```solidity
function updatePlatformFee(uint256 newFeePercent) external onlyOwner
```

**Parameters**

| Name | Type | Constraints | Description |
|---|---|---|---|
| `newFeePercent` | `uint256` | 0–1000 | Fee in basis points (500 = 5%, 1000 = 10%) |

**Reverts**
- `InvalidFee()` — exceeds MAX_FEE_PERCENT (1000 = 10%)

---

### `pause()` / `unpause()`

Halt or resume subscription acceptance.

```solidity
function pause() external onlyOwner
function unpause() external onlyOwner
```

**Affected functions during pause:** `subscribe()`, `subscribeWithToken()`

**Unaffected:** View functions, withdrawal functions, admin functions

---

### `transferOwnership()` / `acceptOwnership()`

Two-step ownership transfer.

```solidity
function transferOwnership(address newOwner) public onlyOwner
function acceptOwnership() external  // called by newOwner
```

**Flow:**
1. Owner calls `transferOwnership(newOwnerAddress)` → emits `OwnershipTransferStarted`
2. New owner calls `acceptOwnership()` → completes transfer

---

### `processAutoRenewals()`

Trigger auto-renewal processing for specified user/creator pairs.

```solidity
function processAutoRenewals(
    address[] calldata creatorsList,
    address[] calldata users
) external onlyOwner
```

**⚠️ Note:** The current implementation contains placeholder renewal logic. Payment execution requires additional implementation. See `CUSTOMIZATION.md` for Chainlink Automation integration.

---

## Withdrawal Functions

---

### `withdrawETH()`

Withdraw accumulated ETH from the contract.

```solidity
function withdrawETH(uint256 amount) external onlyOwner
```

**Note:** Most ETH flows through atomically during subscriptions. This covers any ETH sent directly to the contract via `receive()`.

---

### `withdrawTokens()`

Withdraw a specific ERC20 token from the contract.

```solidity
function withdrawTokens(address token, uint256 amount) external onlyOwner
```

---

### `emergencyWithdrawAll()`

Withdraw all ETH and all whitelisted token balances in a single transaction.

```solidity
function emergencyWithdrawAll() external onlyOwner
```

**Use case:** Emergency situations where the contract needs to be drained quickly.

---

## View / Read Functions

---

### `isSubscriptionActive()`

Check whether a user has an active subscription with a creator.

```solidity
function isSubscriptionActive(
    address creator,
    address user
) external view returns (bool)
```

**Includes grace period in calculation** (7 days past expiry = still active).

**Example**

```javascript
// Gate content based on subscription
const isActive = await contract.isSubscriptionActive(creatorAddress, userAddress);
if (!isActive) throw new Error("Subscribe to access this content");
```

---

### `getSubscriptionExpiry()`

Get the exact Unix timestamp when a subscription expires.

```solidity
function getSubscriptionExpiry(
    address creator,
    address user
) external view returns (uint256)
```

**Returns:** Unix timestamp, or 0 if no subscription exists.

**Example**

```javascript
const expiry = await contract.getSubscriptionExpiry(creator, user);
const date = new Date(Number(expiry) * 1000);
console.log(`Subscription expires: ${date.toLocaleDateString()}`);
```

---

### `getCreatorTiersCount()`

Get the number of subscription tiers a creator has configured.

```solidity
function getCreatorTiersCount(address creator) external view returns (uint256)
```

---

### `getCreatorTier()`

Get full details of a specific subscription tier.

```solidity
function getCreatorTier(
    address creator,
    uint256 tierIndex
) external view returns (SubscriptionPlan memory)
```

**Returns:** `SubscriptionPlan` struct with `fee`, `tokenFee`, `duration`, `metadata`, `benefits`, `active`.

**Example**

```javascript
// Display all plans for a creator
const count = await contract.getCreatorTiersCount(creatorAddress);
for (let i = 0; i < count; i++) {
    const plan = await contract.getCreatorTier(creatorAddress, i);
    console.log(`Tier ${i}: ${plan.metadata} — ${ethers.formatEther(plan.fee)} ETH/period`);
}
```

---

### `getSubscriptionHistory()`

Get complete subscription transaction history for a user.

```solidity
function getSubscriptionHistory(
    address user
) external view returns (SubscriptionRecord[] memory)
```

**Returns:** Array of `SubscriptionRecord` structs (max 100 entries, oldest evicted first).

---

### `getUserActiveSubscriptions()`

Get all active creator addresses and their expiry times for a user.

```solidity
function getUserActiveSubscriptions(
    address user
) external view returns (address[] memory creators, uint256[] memory expiryTimes)
```

**Returns:** Parallel arrays — `creators[i]` expires at `expiryTimes[i]`.

**Example**

```javascript
const [creators, expiries] = await contract.getUserActiveSubscriptions(userAddress);
creators.forEach((creator, i) => {
    const days = Math.floor((Number(expiries[i]) - Date.now()/1000) / 86400);
    console.log(`${creator}: ${days} days remaining`);
});
```

---

### `getCreatorAnalytics()`

Get earnings and subscriber statistics for a creator.

```solidity
function getCreatorAnalytics(
    address creator
) external view returns (CreatorAnalytics memory)
```

**Returns:** `CreatorAnalytics` struct with `totalEarningsETH`, `totalEarningsTokens`, `totalSubscribers`.

**Note:** `totalSubscribers` is a lifetime count (includes churned subscribers). For active subscriber count, use `getActiveSubscriberCount()`.

---

### `getActiveSubscriberCount()`

Calculate the current number of active subscribers for a creator.

```solidity
function getActiveSubscriberCount(address creator) external view returns (uint32)
```

**⚠️ Gas Note:** This iterates `msg.sender`'s active subscriptions list — gas cost scales with list length. Use off-chain indexing for high-volume dashboards.

---

## Events Reference

```solidity
// User subscribes via ETH
event Subscribed(
    address indexed user,
    address indexed creator,
    uint256 tierIndex,
    uint256 expiry
);

// User subscribes via ERC20
event SubscribedWithToken(
    address indexed user,
    address indexed creator,
    uint256 tierIndex,
    uint256 expiry
);

// Auto-renewal preference changed
event AutoRenewalEnabled(address indexed creator, address indexed user);
event AutoRenewalDisabled(address indexed creator, address indexed user);

// Subscription state changes
event SubscriptionSuspended(address indexed user, address indexed creator, uint256 expiry);
event SubscriptionReactivated(address indexed user, address indexed creator, uint256 expiry);
event SubscriptionCancelled(address indexed user, address indexed creator);

// Creator management
event CreatorAdded(address indexed creator);
event CreatorRemoved(address indexed creator);
event PlanUpdated(
    address indexed creator,
    uint256 indexed tierIndex,
    uint256 fee,
    uint256 tokenFee,
    uint256 duration,
    string metadata,
    string benefits
);
event PlanStatusToggled(address indexed creator, uint256 indexed tierIndex, bool active);

// Platform events
event PlatformFeeUpdated(uint256 oldFee, uint256 newFee);
event TokenWhitelisted(address indexed token);
event TokenRemovedFromWhitelist(address indexed token);
event Paused();
event Unpaused();

// Financial events
event FeesDistributed(address indexed creator, uint256 creatorShare, uint256 platformFee);
event ETHWithdrawn(address indexed to, uint256 amount);
event TokensWithdrawn(address indexed token, address indexed to, uint256 amount);

// Ownership
event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
```

---

## Error Reference

```solidity
error NotOwner();                 // Caller is not the contract owner
error NotCreator();               // Caller does not have creator role
error ContractPaused();           // Contract is currently paused
error InvalidCreator();           // Target address is not a registered creator
error InvalidTierIndex();         // Tier index out of bounds
error InsufficientPayment();      // msg.value less than required fee
error TokenNotSupported();        // ERC20 token not in whitelist
error TransferFailed();           // Native ETH transfer failed
error InvalidAddress();           // Zero address provided
error NoActiveSubscription();     // No active subscription found
error NoSuspendedSubscription();  // No suspended subscription found
error InvalidDuration();          // Duration outside 1-365 day range
error NoFundsToWithdraw();        // Requested amount exceeds balance
error AlreadySuspended();         // Subscription already in suspended state
error InvalidFee();               // Fee exceeds MAX_FEE_PERCENT (10%)
error InvalidStringLength();      // String is empty or exceeds max length
error ArrayLengthMismatch();      // processAutoRenewals arrays differ in length
error TierLimitExceeded();        // Creator already has MAX_TIERS (10) tiers
error PlanNotActive();            // Selected plan is deactivated
error InsufficientAllowance();    // ERC20 allowance insufficient
error PendingOwnerOnly();         // Only pending owner can call acceptOwnership
```

---

## Constants & State Variables

```solidity
// Immutable constants
uint256 public constant MAX_TIERS = 10;           // Max subscription tiers per creator
uint256 public constant MAX_FEE_PERCENT = 1000;   // 10% ceiling on platform fee
uint256 public constant MAX_HISTORY_RECORDS = 100; // Max subscription history per user

// Configurable by owner
uint256 public platformFeePercent = 500;  // Default 5% (basis points)
uint256 public gracePeriod = 7 days;      // Grace period after subscription expiry
bool public paused = false;               // Emergency pause flag

// Token
IERC20 public defaultPaymentToken;        // Set in constructor
```

---

*Function reference for SubscriptionPlatform v1.0.0*
*All function signatures are from the deployed contract. Verify against on-chain bytecode before integration.*
