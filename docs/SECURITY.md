# Security Analysis

> **SubscriptionPlatform Smart Contract** — Comprehensive security documentation for technical due diligence and audit purposes.

---

## Table of Contents

- [Security Summary](#security-summary)
- [Threat Model](#threat-model)
- [Security Controls](#security-controls)
- [Known Risks & Mitigations](#known-risks--mitigations)
- [Attack Vector Analysis](#attack-vector-analysis)
- [Custom Error Reference](#custom-error-reference)
- [Audit Checklist](#audit-checklist)
- [Deployment Security](#deployment-security)
- [Incident Response](#incident-response)

---

## Security Summary

| Category | Status | Notes |
|---|---|---|
| Reentrancy Protection | ✅ Protected | `nonReentrant` on all fund-moving functions |
| Access Control | ✅ Implemented | Role-based with custom errors |
| Integer Overflow | ✅ Protected | Solidity ^0.8.20 native overflow checks |
| Token Safety | ✅ Protected | SafeERC20 for all token transfers |
| Ownership Safety | ✅ Protected | Ownable2Step (two-step transfer) |
| Input Validation | ✅ Implemented | Custom errors for all invalid inputs |
| Emergency Controls | ✅ Available | Pause + emergency withdraw |
| Flash Loan Attacks | ✅ Not Applicable | No price calculations based on spot values |
| Oracle Dependency | ✅ None | No external price feeds |
| Proxy/Upgrade Risk | ✅ None | Non-upgradeable by design |

---

## Threat Model

### Assets at Risk

1. **ETH** — Subscription fees in transit (held momentarily during `subscribe()`)
2. **ERC20 tokens** — Payment tokens (transferred directly, not held)
3. **Creator earnings** — Pushed atomically, not held in contract
4. **Subscription state** — Access control data for gated content

### Threat Actors

| Actor | Capability | Primary Motivation |
|---|---|---|
| Malicious User | Can call any public function | Bypass payment, extend subscriptions for free |
| Malicious Creator | Has creator role | Drain users via plan manipulation |
| Compromised Owner | Has admin access | Drain contract, extort creators |
| External Attacker | No privileged access | Reentrancy, front-running, DoS |
| Malicious Token | Controls ERC20 code | Re-entrancy via transfer callback |

---

## Security Controls

### 1. Reentrancy Guard

```solidity
// Applied to:
function subscribe(...) external payable nonReentrant { ... }
function subscribeWithToken(...) external nonReentrant { ... }
```

The `ReentrancyGuard` from OpenZeppelin sets a lock flag before execution and clears it after. Any re-entrant call during execution will revert with `ReentrancyGuardReentrantCall`.

**Why this matters:** The `subscribe()` function sends ETH to the creator and owner *before* updating subscription state (Checks-Effects-Interactions pattern is partially satisfied by the guard).

> **Note for auditors:** ETH is distributed *before* `_processSubscription()` updates state. This is intentional — the reentrancy guard protects this ordering. Consider refactoring to full CEI pattern for defence-in-depth.

### 2. Ownable2Step

```solidity
// Ownership transfer requires two transactions:
owner.transferOwnership(newOwner);  // Step 1: nominate
newOwner.acceptOwnership();         // Step 2: accept
```

Prevents accidental transfers to wrong addresses — common cause of permanent contract lockout.

**Custom override:** The contract implements its own `pendingOwnerOverride` tracking alongside Ownable2Step's internal `_pendingOwner`. Verify both are consistent during audit.

### 3. SafeERC20

All ERC20 interactions use `SafeERC20.safeTransferFrom()` and `safeTransfer()`:

```solidity
token.safeTransferFrom(msg.sender, creator, creatorShare);
token.safeTransferFrom(msg.sender, owner(), platformFee);
```

This handles tokens that:
- Return `false` instead of reverting on failure
- Don't return a value (non-standard ERC20)
- Have buggy implementations

### 4. Input Validation (Custom Errors)

All inputs are validated at function entry via modifiers and inline checks:

```solidity
modifier validAddress(address _addr) {
    if (_addr == address(0)) revert InvalidAddress();
    _;
}

modifier validString(string calldata _str, uint256 maxLength) {
    if (bytes(_str).length == 0) revert InvalidStringLength();
    if (bytes(_str).length > maxLength) revert InvalidStringLength();
    _;
}

modifier hasSufficientAllowance(address token, uint256 amount) {
    if (IERC20(token).allowance(msg.sender, address(this)) < amount)
        revert InsufficientAllowance();
    _;
}
```

**Custom errors are ~50% cheaper than string reverts** in Solidity ≥0.8.4 due to shorter ABI encoding.

### 5. Emergency Controls

```solidity
function pause() external onlyOwner      // Halts subscribe() and subscribeWithToken()
function unpause() external onlyOwner
function emergencyWithdrawAll() external onlyOwner  // Recovers all ETH + whitelisted tokens
```

The `notPaused` modifier is applied to subscription functions. Admin functions (withdrawal, creator management) remain operational during pause — allowing orderly recovery.

---

## Known Risks & Mitigations

### Risk 1: Centralized Owner Control

**Description:** The owner can pause the contract, update platform fees, whitelist/delist tokens, and withdraw accumulated ETH.

**Severity:** Medium (trust assumption)

**Current Mitigations:**
- `MAX_FEE_PERCENT = 1000` (10%) — hard cap on platform fee, cannot exceed 10%
- Fee changes emit `PlatformFeeUpdated` events — transparent on-chain
- Owner cannot modify creator plans or user subscriptions directly

**Recommended Additional Mitigation:**
- Implement a timelock on fee changes (48-72 hour delay)
- Use a multi-sig wallet (Gnosis Safe) as owner from day 1
- Consider renouncing upgrade rights via governance

### Risk 2: ETH Push Pattern

**Description:** ETH is pushed to creator and owner addresses via `.call{value}`. If either recipient is a smart contract with a failing `receive()` function, the entire subscription fails.

**Severity:** Low (controllable by creators)

**Mitigation:** Creators should use EOA addresses or contracts with simple `receive()` functions. Document this requirement clearly.

**Alternative pattern (pull):**
```solidity
// Consider adding a balance withdrawal pattern for creators:
mapping(address => uint256) public pendingWithdrawals;
// Accumulate fees, let creators withdraw at will
```

### Risk 3: Subscription History Gas Cost

**Description:** `subscriptionHistory` shifts array elements when at capacity (O(n) = O(100) operations). This adds fixed gas overhead for active users.

**Severity:** Low (bounded at 100 records)

**Mitigation:** `MAX_HISTORY_RECORDS = 100` bounds the cost. At 100 records, the shift adds ~21,000 gas per subscription for heavy users.

### Risk 4: Active Subscriptions List Unbounded

**Description:** `userActiveSubscriptions[user]` grows with each unique creator subscribed. There's no cap.

**Severity:** Low-Medium

**Current Behavior:** `_addActiveSubscription()` checks for duplicates via linear scan (O(n)) — gas cost grows with number of active subscriptions.

**Mitigation for high-volume users:** Front-ends should monitor this array length and warn users with >50 active subscriptions.

### Risk 5: Auto-Renewal Placeholder

**Description:** `processAutoRenewals()` contains placeholder logic — it checks renewal conditions but doesn't execute payment.

**Severity:** Informational (feature incomplete)

**Current State:** Auto-renewal flags can be set by users, but actual renewal execution requires off-chain infrastructure (Chainlink Automation, Gelato, or custom keeper).

**For production:** Integrate Chainlink Automation or Gelato for trustless execution. See `CUSTOMIZATION.md`.

### Risk 6: ERC20 Token Trust

**Description:** Any token added to the whitelist by the owner can be used for payments. Malicious ERC20 tokens could:
- Implement re-entrancy in transfer callbacks
- Charge hidden fees reducing actual received amounts
- Be non-standard (missing return values — handled by SafeERC20)

**Mitigation:** Whitelist only well-audited, reputable tokens. Never whitelist tokens you don't control or haven't reviewed.

---

## Attack Vector Analysis

### Reentrancy Attack — PROTECTED

```
Attacker deploys malicious contract
Attacker subscribes → ETH sent to attacker's receive()
receive() calls subscribe() again
→ BLOCKED by nonReentrant modifier
```

### Fee Manipulation — PROTECTED

```
Attacker calls subscribe() with 0 ETH hoping fee = 0
→ InsufficientPayment() if plan.fee > 0
→ Note: Creators CAN set fee = 0 (free tier)
```

### Tier Index Out of Bounds — PROTECTED

```
Attacker calls subscribe(creator, 9999)
→ InvalidTierIndex() — checked against creatorTiers[creator].length
```

### Subscription Expiry Manipulation — NOT POSSIBLE

```
Attacker tries to extend own subscription without payment
→ All expiry changes require payment (subscribe/subscribeWithToken)
→ suspendedSubscription only restores stored value, no extension
```

### Creator Impersonation — NOT POSSIBLE

```
Attacker calls updateCreatorPlan() pretending to be a creator
→ onlyCreator modifier: creators[msg.sender] must be true
→ Only owner can grant creator role
```

### Token Drain via withdrawTokens — PROTECTED

```
Attacker calls withdrawTokens(token, amount)
→ onlyOwner modifier blocks non-owner callers
```

### Platform Fee Bypass — NOT POSSIBLE

```
Attacker tries to pay creator directly, bypassing platform fee
→ Fee calculation is internal, always applied before creator receives funds
→ Cannot subscribe without going through subscribe() / subscribeWithToken()
```

---

## Custom Error Reference

| Error | Trigger Condition | Gas Saving vs String |
|---|---|---|
| `NotOwner()` | Caller is not owner | ~500 gas |
| `NotCreator()` | Caller not in creators mapping | ~500 gas |
| `ContractPaused()` | `paused == true` | ~300 gas |
| `InvalidCreator()` | Target address not a creator | ~600 gas |
| `InvalidTierIndex()` | Tier index out of bounds | ~600 gas |
| `InsufficientPayment()` | `msg.value < plan.fee` | ~700 gas |
| `TokenNotSupported()` | Token not whitelisted | ~700 gas |
| `TransferFailed()` | ETH `.call` returned false | ~400 gas |
| `InvalidAddress()` | Zero address provided | ~400 gas |
| `NoActiveSubscription()` | No active subscription found | ~700 gas |
| `NoSuspendedSubscription()` | No suspended subscription found | ~700 gas |
| `InvalidDuration()` | Duration outside 1-365 days | ~600 gas |
| `NoFundsToWithdraw()` | Amount exceeds balance | ~600 gas |
| `AlreadySuspended()` | Subscription already suspended | ~600 gas |
| `InvalidFee()` | Fee exceeds MAX_FEE_PERCENT | ~500 gas |
| `InvalidStringLength()` | String empty or too long | ~500 gas |
| `ArrayLengthMismatch()` | processAutoRenewals input mismatch | ~600 gas |
| `TierLimitExceeded()` | Creator has 10 tiers already | ~600 gas |
| `PlanNotActive()` | Plan's `active` flag is false | ~500 gas |
| `InsufficientAllowance()` | ERC20 allowance too low | ~700 gas |
| `PendingOwnerOnly()` | Wrong caller for acceptOwnership | ~500 gas |

---

## Audit Checklist

Use this checklist when conducting a security review of this contract or any fork:

### Access Control
- [ ] `onlyOwner` applied to all admin functions
- [ ] `onlyCreator` applied to creator-specific functions
- [ ] Creator cannot modify another creator's plans
- [ ] Owner cannot modify creator plans or user subscriptions
- [ ] Two-step ownership transfer working correctly

### Arithmetic
- [ ] All fee calculations use basis points (divide by 10000)
- [ ] `platformFee + creatorShare == totalAmount` (no dust leakage)
- [ ] `_calculateNewExpiry` handles both active and expired subscriptions
- [ ] No overflow possible on subscription expiry timestamps

### Token Safety
- [ ] All ERC20 transfers use SafeERC20
- [ ] No raw `transfer()` or `transferFrom()` calls
- [ ] Token whitelist enforced before any token interaction
- [ ] Zero-address token handling

### State Consistency
- [ ] Suspension correctly zeros `creatorSubscriptions`
- [ ] Reactivation correctly restores from `suspendedSubscriptions`
- [ ] `userActiveSubscriptions` stays in sync with actual subscriptions
- [ ] History eviction doesn't corrupt remaining records

### Economic Security
- [ ] Platform fee hardcap (10%) enforced
- [ ] Fee updates emit events
- [ ] Creator receives correct share atomically
- [ ] Excess ETH refunded to user

### Emergency Procedures
- [ ] Pause halts new subscriptions
- [ ] Emergency withdrawal covers all whitelisted tokens
- [ ] Owner can withdraw accumulated ETH

---

## Deployment Security

### Pre-Deployment Checklist

1. **Use a hardware wallet** for owner address (Ledger/Trezor)
2. **Test on Sepolia testnet** with real ERC20 tokens first
3. **Verify constructor parameters** — `_defaultTokenAddress` must be a valid ERC20
4. **Verify contract on Etherscan** immediately after deployment
5. **Set up monitoring** — Tenderly alerts for Paused, PlatformFeeUpdated events
6. **Document deployed address** and keep constructor args for verification

### Post-Deployment Security

```bash
# 1. Verify source code on Etherscan
npx hardhat verify --network mainnet DEPLOYED_ADDRESS "TOKEN_ADDRESS"

# 2. Verify ownership
cast call DEPLOYED_ADDRESS "owner()" --rpc-url YOUR_RPC

# 3. Verify platform fee
cast call DEPLOYED_ADDRESS "platformFeePercent()" --rpc-url YOUR_RPC
# Should return 500 (5%)

# 4. Test pause/unpause on mainnet before going live
```

### Multi-sig Recommendation

For any deployment handling >$10,000 in volume, use a Gnosis Safe as owner:

```
Recommended: 2-of-3 or 3-of-5 multi-sig
Signers: Founder + Technical Lead + Lawyer/Advisor
```

---

## Incident Response

### If Vulnerability Discovered

1. **Immediately pause the contract:** `contract.pause()`
2. **Do not announce publicly** until funds are safe
3. **Emergency withdraw** all ETH: `contract.emergencyWithdrawAll()`
4. **Notify creators** via off-chain channels
5. **Deploy fixed version** and document the issue
6. **Refund affected users** from emergency-withdrawn funds

### If Owner Key Compromised

1. Transfer ownership to a fresh address immediately via Ownable2Step
2. Pause the contract if attacker has not yet acted
3. Emergency withdraw all funds
4. Audit what the attacker may have done (check events)

### Emergency Contacts

> Customize this section with your team's contact information before selling/deploying.

- Smart Contract Developer: [YOUR_CONTACT]
- Security Researcher: [AUDIT_FIRM_CONTACT]
- Multisig Signers: [SIGNER_LIST]

---

*Security documentation for SubscriptionPlatform v1.0.0*
*This document does not constitute a formal security audit. Engage a professional audit firm before mainnet deployment handling significant value.*
