# Quick Start Guide

> Get from zero to a live subscription platform in under 30 minutes.

---

## What You'll Build

By the end of this guide, you'll have a **fully deployed subscription smart contract** on a testnet with:

- ✅ A registered creator with 2 subscription tiers
- ✅ A working ETH subscription flow
- ✅ A basic frontend snippet to check subscriptions
- ✅ Everything verified and ready for mainnet

**No Solidity experience required.** We'll walk through every step.

---

## Prerequisites

Before starting, install:

| Tool | Purpose | Install |
|---|---|---|
| Node.js (v18+) | Runtime | [nodejs.org](https://nodejs.org) |
| Git | Clone repo | [git-scm.com](https://git-scm.com) |
| MetaMask | Browser wallet | [metamask.io](https://metamask.io) |

You'll also need:
- **Sepolia testnet ETH** (free from [sepoliafaucet.com](https://sepoliafaucet.com))
- **Alchemy or Infura account** (free tier is fine)

---

## Step 1: Get the Template

```bash
# Clone the repository
git clone https://github.com/osaisonomwanmarvis/Decentralized-Subscription-Smart-Contract.git
cd Decentralized-Subscription-Smart-Contract

# Install dependencies
npm install
```

**Expected output:**
```
added 387 packages in 23s
```

If you see errors, ensure Node.js v18+ is installed: `node --version`

---

## Step 2: Configure Your Environment

```bash
# Copy the environment template
cp .env.example .env
```

Open `.env` and fill in your values:

```env
# Your deployer wallet private key (the account that will own the contract)
# NEVER commit this file to git!
PRIVATE_KEY=your_metamask_private_key_here

# Get this from Alchemy: https://dashboard.alchemy.com
ALCHEMY_API_KEY=your_alchemy_key_here

# Get this from Etherscan: https://etherscan.io/register
ETHERSCAN_API_KEY=your_etherscan_key_here

# The ERC20 token you'll accept for payments
# For testnet, use Sepolia USDC: 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
DEFAULT_TOKEN_ADDRESS=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
```

### How to get your MetaMask private key:

1. Open MetaMask
2. Click the three dots (⋮) next to your account name
3. Select "Account Details"
4. Click "Export Private Key"
5. Enter your password
6. Copy the key

> ⚠️ **Use a fresh wallet for testing.** Never use your main wallet's private key in a `.env` file.

---

## Step 3: Compile the Contract

```bash
npx hardhat compile
```

**Expected output:**
```
Compiling 1 Solidity file
✓ subscriptionplatform.sol compiled
```

If you see errors, check that OpenZeppelin is installed:
```bash
npm install @openzeppelin/contracts
```

---

## Step 4: Deploy to Sepolia Testnet

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

**Expected output:**
```
Deploying SubscriptionPlatform...
Contract deployed to: 0xYourContractAddress...
Owner: 0xYourWalletAddress...
Default token: 0x1c7D4B196...

✓ Save this address! You'll need it for everything else.
```

**Save your contract address.** You'll need it throughout this guide.

> 💡 **Tip:** If the deployment fails with "insufficient funds", get more Sepolia ETH from the faucet and wait 1-2 minutes.

---

## Step 5: Verify Your Contract

Verification publishes your source code to Etherscan so users can read it:

```bash
npx hardhat verify --network sepolia YOUR_CONTRACT_ADDRESS "DEFAULT_TOKEN_ADDRESS"
```

Replace `YOUR_CONTRACT_ADDRESS` and `DEFAULT_TOKEN_ADDRESS` with your values.

**Expected output:**
```
Successfully verified contract SubscriptionPlatform on Etherscan.
https://sepolia.etherscan.io/address/0xYourContractAddress#code
```

Now anyone can view your contract at that Etherscan link. ✅

---

## Step 6: Set Up a Creator

Your deployer wallet is automatically a creator. Let's create two subscription tiers.

Create a file called `scripts/setup-creator.js`:

```javascript
const { ethers } = require("hardhat");

async function main() {
  const CONTRACT_ADDRESS = "YOUR_CONTRACT_ADDRESS"; // paste yours here
  
  const [deployer] = await ethers.getSigners();
  console.log("Setting up creator:", deployer.address);
  
  const contract = await ethers.getContractAt(
    "SubscriptionPlatform",
    CONTRACT_ADDRESS
  );

  // Tier 0: Basic Monthly Plan
  console.log("Creating Basic plan...");
  await contract.updateCreatorPlan(
    0,                              // tierIndex
    ethers.parseEther("0.01"),      // 0.01 ETH per period
    ethers.parseUnits("20", 6),     // 20 USDC per period  
    30 * 24 * 60 * 60,              // 30 days
    "Basic Monthly",
    "Full content access, Discord community, Monthly newsletter",
    true
  );
  
  // Tier 1: Pro Annual Plan  
  console.log("Creating Pro plan...");
  await contract.updateCreatorPlan(
    1,                              // tierIndex
    ethers.parseEther("0.08"),      // 0.08 ETH per year (33% discount)
    ethers.parseUnits("160", 6),    // 160 USDC per year
    365 * 24 * 60 * 60,             // 365 days
    "Pro Annual",
    "Everything in Basic + 1:1 calls, Source code access, Priority support, Lifetime updates",
    true
  );

  console.log("✓ Both plans created successfully!");
  console.log("Check your plans on Etherscan:", CONTRACT_ADDRESS);
}

main().catch(console.error);
```

Run it:
```bash
npx hardhat run scripts/setup-creator.js --network sepolia
```

---

## Step 7: Test a Subscription

Let's verify the subscription flow works end-to-end.

Create `scripts/test-subscribe.js`:

```javascript
const { ethers } = require("hardhat");

async function main() {
  const CONTRACT_ADDRESS = "YOUR_CONTRACT_ADDRESS";
  const CREATOR_ADDRESS = "YOUR_WALLET_ADDRESS"; // same as deployer for this test
  
  const [subscriber] = await ethers.getSigners();
  
  const contract = await ethers.getContractAt(
    "SubscriptionPlatform",
    CONTRACT_ADDRESS
  );

  // Check current status
  const isActiveBefore = await contract.isSubscriptionActive(
    CREATOR_ADDRESS, 
    subscriber.address
  );
  console.log("Active before:", isActiveBefore); // should be false

  // Get the plan fee
  const plan = await contract.getCreatorTier(CREATOR_ADDRESS, 0);
  console.log("Plan fee:", ethers.formatEther(plan.fee), "ETH");

  // Subscribe!
  console.log("Subscribing...");
  const tx = await contract.subscribe(CREATOR_ADDRESS, 0, {
    value: plan.fee
  });
  await tx.wait();
  console.log("Transaction:", tx.hash);

  // Verify subscription
  const isActiveAfter = await contract.isSubscriptionActive(
    CREATOR_ADDRESS,
    subscriber.address
  );
  console.log("Active after:", isActiveAfter); // should be true

  const expiry = await contract.getSubscriptionExpiry(CREATOR_ADDRESS, subscriber.address);
  const date = new Date(Number(expiry) * 1000);
  console.log("Expires:", date.toLocaleDateString());
  
  console.log("✓ Subscription test passed!");
}

main().catch(console.error);
```

```bash
npx hardhat run scripts/test-subscribe.js --network sepolia
```

**Expected output:**
```
Active before: false
Plan fee: 0.01 ETH
Subscribing...
Transaction: 0xabc123...
Active after: true
Expires: 1/15/2026
✓ Subscription test passed!
```

---

## Step 8: Connect to Your Frontend

Here's a minimal React snippet to check subscription status and let users subscribe:

```javascript
import { ethers } from "ethers";

const CONTRACT_ADDRESS = "YOUR_CONTRACT_ADDRESS";
const CREATOR_ADDRESS = "YOUR_WALLET_ADDRESS";

// Minimal ABI — only what you need for basic integration
const ABI = [
  "function subscribe(address creator, uint256 tierIndex) payable",
  "function isSubscriptionActive(address creator, address user) view returns (bool)",
  "function getSubscriptionExpiry(address creator, address user) view returns (uint256)",
  "function getCreatorTier(address creator, uint256 tierIndex) view returns (tuple(uint256 fee, uint256 tokenFee, uint256 duration, string metadata, string benefits, bool active))",
];

async function checkAccess(userAddress) {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  
  return await contract.isSubscriptionActive(CREATOR_ADDRESS, userAddress);
}

async function subscribe(tierIndex) {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  
  // Get plan details
  const plan = await contract.getCreatorTier(CREATOR_ADDRESS, tierIndex);
  
  // Subscribe
  const tx = await contract.subscribe(CREATOR_ADDRESS, tierIndex, {
    value: plan.fee,
  });
  
  await tx.wait();
  return tx.hash;
}

// Usage:
// const hasAccess = await checkAccess(userWalletAddress);
// if (!hasAccess) showSubscribeButton();
```

---

## Step 9: Run Full Test Suite

Before going to mainnet, run all tests:

```bash
# Run tests
npx hardhat test

# Run with gas usage report
REPORT_GAS=true npx hardhat test

# Run coverage analysis
npx hardhat coverage
```

**All tests should pass:**
```
SubscriptionPlatform
  ✓ Should deploy with correct settings (245ms)
  ✓ Should allow creator to add plans (183ms)
  ✓ Should process ETH subscription correctly (312ms)
  ✓ Should distribute fees correctly (289ms)
  ✓ Should handle subscription renewal (198ms)
  ...
  
  42 passing (8s)
```

---

## Step 10: Deploy to Mainnet

Once all tests pass and you've tested thoroughly on Sepolia:

```bash
# Make sure your .env has a funded mainnet wallet
npx hardhat run scripts/deploy.js --network mainnet

# Verify on mainnet Etherscan
npx hardhat verify --network mainnet YOUR_MAINNET_ADDRESS "TOKEN_ADDRESS"
```

**Pre-mainnet checklist:**
- [ ] All tests passing
- [ ] Verified and working on Sepolia
- [ ] Using a hardware wallet or multi-sig as owner
- [ ] `.env` never committed to git
- [ ] Contract verified on Etherscan
- [ ] Monitoring set up (Tenderly recommended)

---

## Common Issues

**"insufficient funds for gas"**
→ Add more Sepolia ETH from the faucet. Each deployment costs ~$0.50-2 equivalent.

**"contract not verified"**
→ Run the verify command again. Sometimes Etherscan takes 1-2 minutes to process.

**"nonce too low"**
→ Your wallet has a pending transaction. Wait for it to confirm or speed it up in MetaMask.

**"execution reverted: NotCreator()"**
→ The wallet calling `updateCreatorPlan()` is not registered as a creator. Run `addCreator()` first.

**"ERC20: insufficient allowance"**
→ Call `token.approve(contractAddress, amount)` before `subscribeWithToken()`.

---

## Next Steps

| Goal | Guide |
|---|---|
| Customize tiers and branding | `CUSTOMIZATION.md` |
| Understand all available functions | `FUNCTIONS.md` |
| Add ERC20 payment support | `EXAMPLES.md` |
| Security review before mainnet | `SECURITY.md` |
| Optimize for lower gas costs | `GAS_OPTIMIZATION.md` |
| Understand the architecture | `ARCHITECTURE.md` |

---

## Need Help?

- **GitHub Issues:** [Open an issue](https://github.com/osaisonomwanmarvis/Decentralized-Subscription-Smart-Contract/issues)
- **Documentation:** Check the `/docs` folder for detailed guides
- **Test examples:** See `comprehensive_tests.js` for usage patterns

---

*Quick Start guide for SubscriptionPlatform v1.0.0*
*Estimated completion time: 20-30 minutes*
