# Troubleshooting Guide

> Quick fixes for the most common issues. If your problem isn't here, open an issue on GitHub with your error message and network name.

---

## Table of Contents

- [Deployment Issues](#deployment-issues)
- [Transaction Errors](#transaction-errors)
- [Subscription Not Showing as Active](#subscription-not-showing-as-active)
- [ERC20 / Token Payment Issues](#erc20--token-payment-issues)
- [Creator / Plan Issues](#creator--plan-issues)
- [Gas & Network Issues](#gas--network-issues)
- [Frontend Integration Issues](#frontend-integration-issues)
- [Testing Issues](#testing-issues)
- [Error Code Reference](#error-code-reference)

---

## Deployment Issues

### "Insufficient funds for gas"

**Symptom:** Deployment fails immediately with a funds error.

**Fix:** Your deployer wallet needs native currency for gas.
- Mainnet: needs ETH
- Polygon: needs MATIC
- Sepolia testnet: get free ETH from [sepoliafaucet.com](https://sepoliafaucet.com)

```bash
# Check your balance
cast balance YOUR_WALLET_ADDRESS --rpc-url YOUR_RPC_URL
```

---

### "Contract deployment failed — nonce too low"

**Symptom:** Deployment fails with a nonce error.

**Fix:** A previous transaction is still pending. Either:
1. Wait for the pending transaction to confirm or fail
2. Speed it up in MetaMask (Settings → Advanced → Speed Up)
3. Cancel it with a 0-value transaction to yourself at higher gas

---

### "Cannot find module '@openzeppelin/contracts'"

**Fix:**
```bash
npm install @openzeppelin/contracts
# or
yarn add @openzeppelin/contracts
```

---

### "HH8: There's one or more errors in your config file"

**Fix:** Check `hardhat.config.js` for syntax errors. Common causes:
- Missing `.env` file (copy from `.env.example`)
- Invalid private key format (should start with `0x` or be 64 hex chars without it)
- Invalid RPC URL

```bash
# Validate your config loads
npx hardhat accounts
```

---

### Deployment succeeds but contract address is wrong on Etherscan

**Fix:** You may have multiple pending transactions. The contract was deployed in a later transaction than expected. Check your wallet's transaction history on Etherscan and find the transaction with `Contract Creation` in the To field.

---

## Transaction Errors

### `NotOwner()` — "You are not the owner"

**Cause:** You're calling an owner-only function from the wrong wallet.

**Fix:** Check `await contract.owner()` — that's the only address that can call admin functions. If you're the owner but getting this error, you may be connected to the wrong wallet in your frontend.

---

### `NotCreator()` — "You are not a creator"

**Cause:** The wallet calling `updateCreatorPlan()` or `togglePlanStatus()` hasn't been granted creator role.

**Fix:**
```javascript
// Owner must run this first:
await contract.addCreator(YOUR_CREATOR_WALLET_ADDRESS);
```

The deployer wallet is automatically a creator. Other wallets must be added explicitly.

---

### `InvalidCreator()` — "Target address is not a creator"

**Cause:** Trying to subscribe to an address that isn't a registered creator.

**Fix:** The `creator` parameter in `subscribe()` must be an address that was added via `addCreator()`. Double-check the address — it must match exactly.

---

### `InsufficientPayment()` — "Not enough ETH sent"

**Cause:** `msg.value` sent with `subscribe()` is less than `plan.fee`.

**Fix:** Always fetch the current fee from the contract before subscribing:
```javascript
const plan = await contract.getCreatorTier(creatorAddress, tierIndex);
await contract.subscribe(creatorAddress, tierIndex, { value: plan.fee });
```

Never hardcode fee amounts — they can be updated by the creator.

---

### `PlanNotActive()` — "This plan is not accepting subscribers"

**Cause:** The creator has deactivated this tier.

**Fix:** Check which plans are active:
```javascript
const count = await contract.getCreatorTiersCount(creator);
for (let i = 0; i < count; i++) {
    const plan = await contract.getCreatorTier(creator, i);
    if (plan.active) console.log(`Tier ${i} is available`);
}
```

---

### `InvalidTierIndex()` — "Tier index out of range"

**Cause:** You're requesting a tier index that doesn't exist for this creator.

**Fix:** Get the tier count first:
```javascript
const count = await contract.getCreatorTiersCount(creator);
// Valid indexes are 0 to count-1
```

---

### `TransferFailed()` — "ETH transfer failed"

**Cause:** The ETH push to the creator or owner address failed. This can happen if:
- Creator address is a smart contract with a reverting `receive()` function
- Creator address is a contract that doesn't accept ETH

**Fix:** Ensure the creator address is an EOA (regular wallet) or a contract that explicitly accepts ETH with a working `receive()` or `fallback()` function.

---

### `AlreadySuspended()` — "Subscription is already suspended"

**Cause:** Calling `suspendSubscription()` when it's already suspended.

**Fix:** Check status before suspending:
```javascript
const suspended = await contract.suspendedSubscriptions(creator, user);
if (suspended === 0n) {
    await contract.suspendSubscription(creator);
} else {
    console.log("Already suspended");
}
```

---

### `ContractPaused()` — "Contract is paused"

**Cause:** Platform owner has paused the contract.

**Fix:** Only the owner can unpause. Contact the platform operator. If you ARE the owner:
```javascript
await contract.unpause();
```

---

## Subscription Not Showing as Active

### Just subscribed but `isSubscriptionActive()` returns `false`

**Common causes and fixes:**

1. **Wrong addresses:** Double-check both `creator` and `user` addresses are correct.
   ```javascript
   // Verify these are correct:
   console.log("Creator:", creatorAddress);
   console.log("User:", await signer.getAddress());
   const active = await contract.isSubscriptionActive(creatorAddress, userAddress);
   ```

2. **Transaction not confirmed yet:** Wait for `tx.wait()` before checking:
   ```javascript
   const tx = await contract.subscribe(creator, 0, { value: fee });
   await tx.wait(); // ← WAIT HERE before checking
   const active = await contract.isSubscriptionActive(creator, user);
   ```

3. **Wrong contract address:** You might be reading from a different deployment.

4. **RPC propagation delay:** Some RPCs lag by 1-2 blocks. Wait a few seconds and retry.

---

### Subscription shows active on testnet but not mainnet

**Fix:** You deployed to two different contracts. Verify the contract addresses match:
```bash
# Check your .env or deployment log for the correct address per network
cat DEPLOYMENT.md
```

---

### Subscription expired but user had auto-renewal enabled

**Cause:** Auto-renewal is a flag-only feature. The contract doesn't execute renewals automatically. It requires the owner to call `processAutoRenewals()` as a keeper.

**Fix options:**
1. Manually call `processAutoRenewals()` periodically
2. Set up Chainlink Automation — see `CUSTOMIZATION.md`
3. Build a simple cron job that queries near-expiry subscriptions and triggers renewal

---

## ERC20 / Token Payment Issues

### `TokenNotSupported()` — "This token is not whitelisted"

**Fix:**
```javascript
// Owner must whitelist the token first:
await contract.addWhitelistedToken(TOKEN_ADDRESS);

// Verify it's whitelisted:
const supported = await contract.whitelistedTokens(TOKEN_ADDRESS);
console.log("Whitelisted:", supported); // should be true
```

---

### `InsufficientAllowance()` — "ERC20 allowance too low"

**Fix:** You must approve the contract to spend tokens before calling `subscribeWithToken()`:
```javascript
const tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
const plan = await contract.getCreatorTier(creator, tierIndex);

// Approve exact amount (or MaxUint256 for unlimited approval)
await tokenContract.approve(CONTRACT_ADDRESS, plan.tokenFee);

// Then subscribe
await contract.subscribeWithToken(creator, tierIndex, TOKEN_ADDRESS);
```

---

### "ERC20: transfer amount exceeds balance"

**Cause:** The user doesn't have enough tokens.

**Fix:** Check balance before attempting:
```javascript
const balance = await tokenContract.balanceOf(userAddress);
const required = plan.tokenFee;
if (balance < required) {
    console.log(`Need ${formatUnits(required, 6)} USDC, have ${formatUnits(balance, 6)}`);
}
```

---

### Token subscription succeeds but creator received wrong amount

**Cause:** Some tokens have transfer fees (deflationary tokens). The contract transfers `creatorShare` but the token deducts a fee, so less arrives.

**Fix:** Avoid whitelisting fee-on-transfer tokens. Stick to standard tokens like USDC, USDT, WETH.

---

## Creator / Plan Issues

### `TierLimitExceeded()` — "Creator already has 10 tiers"

**Cause:** `MAX_TIERS = 10` — a creator can have at most 10 tiers.

**Fix:** Deactivate old/unused tiers instead of creating new ones:
```javascript
// Deactivate an old tier
await contract.togglePlanStatus(OLD_TIER_INDEX);

// Then update that slot with new plan
await contract.updateCreatorPlan(OLD_TIER_INDEX, newFee, ...);
```

---

### Plan metadata not showing in frontend

**Cause:** Metadata is stored as a `string` in contract storage — reading it requires a view call, not an event.

**Fix:**
```javascript
// Always fetch from contract, don't cache locally
const plan = await contract.getCreatorTier(creator, tierIndex);
console.log(plan.metadata, plan.benefits);
```

---

### `InvalidDuration()` — "Duration must be 1-365 days"

**Cause:** Plan duration is outside allowed range.

**Fix:** Duration is in seconds:
```javascript
const ONE_DAY = 86400;      // 1 * 24 * 60 * 60
const ONE_YEAR = 31536000;  // 365 * 86400

// Examples
const weekly  = 7 * ONE_DAY;    // 604800
const monthly = 30 * ONE_DAY;   // 2592000
const annual  = 365 * ONE_DAY;  // 31536000
```

---

## Gas & Network Issues

### Transaction stuck as "pending" for a long time

**Fix:** Gas price too low. Speed up in MetaMask or:
```javascript
// Retry with higher gas
const tx = await contract.subscribe(creator, 0, {
    value: fee,
    maxFeePerGas: ethers.parseUnits("50", "gwei"), // increase this
    maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
});
```

---

### "out of gas" error

**Cause:** Gas limit estimate was too low.

**Fix:**
```javascript
// Estimate first, add 20% buffer
const gasEstimate = await contract.subscribe.estimateGas(creator, 0, { value: fee });
const gasLimit = (gasEstimate * 120n) / 100n; // 20% buffer

await contract.subscribe(creator, 0, { value: fee, gasLimit });
```

---

## Frontend Integration Issues

### MetaMask shows wrong network

**Fix:** Add a network switch prompt:
```javascript
try {
    await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x1" }], // 0x1 = mainnet, 0xaa36a7 = sepolia
    });
} catch (err) {
    if (err.code === 4902) {
        // Network not added — prompt user to add it
    }
}
```

---

### Contract call returns stale data after transaction

**Cause:** Your provider is caching the old state.

**Fix:** Use `provider.getBlock("latest")` to flush cache, or simply wait 1-2 seconds after `tx.wait()`:
```javascript
await tx.wait();
await new Promise(r => setTimeout(r, 1500)); // small delay
const freshData = await contract.isSubscriptionActive(creator, user);
```

---

## Testing Issues

### Tests fail with "cannot estimate gas"

**Fix:** Usually means a transaction will revert. Add `.to.be.revertedWithCustomError()` to catch it or check your test setup:
```javascript
// Debug: get the revert reason
try {
    await contract.subscribe(creator, 0, { value: 0n });
} catch (e) {
    console.log(e.message); // Will show the custom error name
}
```

---

### "HardhatEthersSigner" not connecting to contract

**Fix:** Use the correct signer pattern in Hardhat tests:
```javascript
const [owner, creator, user] = await ethers.getSigners();
const contract = await ethers.getContractAt("SubscriptionPlatform", address);

// Connect specific signer
await contract.connect(creator).updateCreatorPlan(...);
await contract.connect(user).subscribe(...);
```

---

## Error Code Reference

Quick lookup table for all custom errors:

| Error | Most Likely Cause | Quick Fix |
|---|---|---|
| `NotOwner` | Wrong wallet calling admin function | Switch to owner wallet |
| `NotCreator` | Wallet not registered as creator | Call `addCreator()` first |
| `ContractPaused` | Platform is paused | Contact platform owner |
| `InvalidCreator` | Subscribe target isn't a creator | Check creator address |
| `InvalidTierIndex` | Tier doesn't exist | Get tier count first |
| `InsufficientPayment` | Too little ETH sent | Fetch `plan.fee` before subscribing |
| `TokenNotSupported` | Token not whitelisted | Call `addWhitelistedToken()` |
| `TransferFailed` | ETH push to contract rejected | Use EOA for creator address |
| `InvalidAddress` | Zero address passed | Check for null/undefined address |
| `NoActiveSubscription` | No active sub for operation | Subscribe first |
| `NoSuspendedSubscription` | No suspended sub to restore | Check suspension status |
| `InvalidDuration` | Duration outside 1-365 days | Use seconds, check bounds |
| `NoFundsToWithdraw` | Amount exceeds balance | Check balance first |
| `AlreadySuspended` | Already suspended | Can't suspend twice |
| `InvalidFee` | Fee > 10% | Max is 1000 basis points |
| `InvalidStringLength` | Empty string or too long | Check 256/512 char limits |
| `ArrayLengthMismatch` | Arrays differ in length | Match array lengths |
| `TierLimitExceeded` | Creator has 10 tiers already | Deactivate old tier first |
| `PlanNotActive` | Plan is deactivated | Choose an active tier |
| `InsufficientAllowance` | ERC20 approval missing | Call `approve()` first |
| `PendingOwnerOnly` | Wrong wallet calling `acceptOwnership` | New owner must accept |

---

*Still stuck? Open an issue at [github.com/osaisonomwanmarvis/Decentralized-Subscription-Smart-Contract/issues](https://github.com/osaisonomwanmarvis/Decentralized-Subscription-Smart-Contract/issues) with your error message, network name, and transaction hash.*
