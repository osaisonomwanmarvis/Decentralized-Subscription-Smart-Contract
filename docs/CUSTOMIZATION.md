# Customization Guide

> **For Agencies** — How to adapt this template for different client projects, bill confidently, and deliver in days instead of weeks.

---

## Table of Contents

- [Agency Workflow Overview](#agency-workflow-overview)
- [Common Client Scenarios](#common-client-scenarios)
- [Customization Reference](#customization-reference)
- [Branding & White-Labeling](#branding--white-labeling)
- [Chainlink Automation Integration](#chainlink-automation-integration)
- [Multi-Client Deployment Pattern](#multi-client-deployment-pattern)
- [Subgraph Integration](#subgraph-integration)
- [Testing Your Customizations](#testing-your-customizations)

---

## Agency Workflow Overview

This is how to take a client from brief to delivered contract in under a week:

```
Day 1: Discovery   → Map client requirements to built-in features
Day 2: Configure   → Set fees, tiers, token whitelist
Day 3: Customize   → Add any client-specific functions from this guide
Day 4: Test        → Run full test suite + client UAT on testnet
Day 5: Deploy      → Mainnet deployment + Etherscan verification
Day 6: Handoff     → Documentation, admin guide, monitoring setup
```

Most client projects require **zero Solidity changes** — just configuration. The customizations below cover the 20% of projects that need code-level changes.

---

## Common Client Scenarios

### Scenario 1: SaaS Platform (Developer Tools, Analytics, APIs)

**Client brief:** "We sell monthly API access at $29/month and annual at $249/year."

**What to configure — no code changes needed:**

```javascript
// Tier 0: Monthly
await contract.updateCreatorPlan(
    0,
    ethers.parseEther("0.01"),     // ~$29 at current ETH price
    ethers.parseUnits("29", 6),    // $29 USDC (exact)
    30 * 24 * 60 * 60,             // 30 days
    "Starter Monthly",
    "10,000 API calls/month, Standard support, API dashboard access",
    true
);

// Tier 1: Annual (14% discount)
await contract.updateCreatorPlan(
    1,
    ethers.parseEther("0.083"),    // ~$249 at current ETH price
    ethers.parseUnits("249", 6),   // $249 USDC
    365 * 24 * 60 * 60,            // 365 days
    "Pro Annual",
    "120,000 API calls/month, Priority support, Custom integrations, 14% discount",
    true
);
```

**Integration point:** Check `isSubscriptionActive(clientAddress, userAddress)` in your API middleware before serving requests.

---

### Scenario 2: Content Creator Platform (Newsletter, Podcast, Video)

**Client brief:** "I have free, supporter, and VIP tiers."

```javascript
// Tier 0: Free tier (no payment)
await contract.updateCreatorPlan(
    0,
    0,                             // Free ETH
    0,                             // Free tokens
    30 * 24 * 60 * 60,             // 30 days (resubscribe monthly to stay active)
    "Free",
    "Public posts, Community access",
    true
);

// Tier 1: Supporter
await contract.updateCreatorPlan(
    1,
    ethers.parseEther("0.005"),
    ethers.parseUnits("15", 6),
    30 * 24 * 60 * 60,
    "Supporter",
    "All posts, Early access, Discord supporter role",
    true
);

// Tier 2: VIP
await contract.updateCreatorPlan(
    2,
    ethers.parseEther("0.025"),
    ethers.parseUnits("75", 6),
    30 * 24 * 60 * 60,
    "VIP",
    "Everything + Monthly 1:1 call, Source files, Private Telegram, First access to courses",
    true
);
```

---

### Scenario 3: B2B Platform (Enterprise Clients, Team Seats)

**Client brief:** "We sell team licenses — $499/month for up to 25 users."

This requires a small customization — a **multi-seat subscription** function:

```solidity
// Add to contract: multi-seat subscription
mapping(address => mapping(address => uint256)) public seatAllowance; // org → user → seats

function subscribeTeam(
    address creator,
    uint256 tierIndex,
    uint256 seats
) external payable notPaused nonReentrant {
    SubscriptionPlan memory plan = creatorTiers[creator][tierIndex];
    uint256 totalFee = plan.fee * seats;
    if (msg.value < totalFee) revert InsufficientPayment();
    
    (uint256 creatorShare, uint256 platformFee) = _calculateFees(totalFee);
    _distributeETHFees(creator, creatorShare, platformFee);
    _processSubscription(creator, tierIndex, plan.duration, totalFee, address(0));
    
    seatAllowance[msg.sender][creator] = seats;
    emit TeamSubscribed(msg.sender, creator, tierIndex, seats);
}

// Team members check access against org subscription
function isTeamMemberActive(
    address org,
    address creator,
    address member
) external view returns (bool) {
    // Your logic: is 'member' authorized under 'org'?
    return _isSubscriptionActive(creator, org) && isOrgMember[org][member];
}
```

---

### Scenario 4: NFT-Gated Platform

**Client brief:** "Holders of our NFT get free access. Everyone else pays."

```solidity
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

// Add state variable
IERC721 public nftContract;

// Add to constructor or as setter
function setNFTContract(address _nft) external onlyOwner {
    nftContract = IERC721(_nft);
}

// Override subscription check
function isSubscriptionActive(address creator, address user)
    external view returns (bool) {
    // NFT holders get free access
    if (address(nftContract) != address(0) && nftContract.balanceOf(user) > 0) {
        return true;
    }
    // Everyone else needs a paid subscription
    return _isSubscriptionActive(creator, user);
}
```

---

### Scenario 5: USDC-Only Platform (No ETH Payments)

Some clients want to price in USD stablecoins only — no ETH volatility.

**No contract changes needed.** Configure plans with `fee = 0` and a non-zero `tokenFee`, then only advertise the token payment path:

```javascript
// Only expose subscribeWithToken() in your frontend
// Set ETH fee to 0 to prevent ETH payments if desired
await contract.updateCreatorPlan(
    0,
    0,                              // ETH fee = 0 (disable ETH path)
    ethers.parseUnits("29", 6),     // USDC only
    30 * 24 * 60 * 60,
    "Monthly",
    "Full access",
    true
);

// Whitelist USDC
await contract.addWhitelistedToken(USDC_ADDRESS);
```

---

## Customization Reference

### Changing the Platform Fee

```javascript
// Change to 3% (300 basis points)
await contract.updatePlatformFee(300);

// Change to 0% (free platform, creator keeps 100%)
await contract.updatePlatformFee(0);

// Maximum allowed is 10% (1000 basis points) — hardcoded limit
```

### Adding a Grace Period Setter

The grace period is currently set to 7 days with no admin function to change it. Add this:

```solidity
uint256 public constant MIN_GRACE_PERIOD = 1 days;
uint256 public constant MAX_GRACE_PERIOD = 30 days;

function updateGracePeriod(uint256 newPeriod) external onlyOwner {
    if (newPeriod < MIN_GRACE_PERIOD || newPeriod > MAX_GRACE_PERIOD)
        revert InvalidDuration();
    gracePeriod = newPeriod;
    emit GracePeriodUpdated(newPeriod);
}
```

### Adding Referral Tracking

```solidity
mapping(address => address) public referredBy;
mapping(address => uint256) public referralEarnings;
uint256 public referralFeePercent = 100; // 1% of subscription fee

function subscribeWithReferral(
    address creator,
    uint256 tierIndex,
    address referrer
) external payable notPaused nonReentrant {
    // Standard validation...
    
    SubscriptionPlan memory plan = creatorTiers[creator][tierIndex];
    
    // Calculate split: platform 5%, referrer 1%, creator 94%
    uint256 platformFee = (plan.fee * platformFeePercent) / 10000;
    uint256 referralFee = referrer != address(0) 
        ? (plan.fee * referralFeePercent) / 10000 
        : 0;
    uint256 creatorShare = plan.fee - platformFee - referralFee;
    
    // Distribute
    (bool s1,) = creator.call{value: creatorShare}("");
    (bool s2,) = owner().call{value: platformFee}("");
    if (referrer != address(0)) {
        (bool s3,) = referrer.call{value: referralFee}("");
        if (!s3) revert TransferFailed();
        referralEarnings[referrer] += referralFee;
    }
    if (!s1 || !s2) revert TransferFailed();
    
    if (referredBy[msg.sender] == address(0) && referrer != address(0)) {
        referredBy[msg.sender] = referrer;
    }
    
    _processSubscription(creator, tierIndex, plan.duration, plan.fee, address(0));
}
```

### Adding a Discount Code System

```solidity
mapping(bytes32 => uint256) public discountCodes; // hash → discount in basis points

function addDiscountCode(string calldata code, uint256 discountBps) external onlyOwner {
    require(discountBps <= 5000, "Max 50% discount"); // cap at 50%
    discountCodes[keccak256(abi.encodePacked(code))] = discountBps;
}

function subscribeWithDiscount(
    address creator,
    uint256 tierIndex,
    string calldata discountCode
) external payable notPaused nonReentrant {
    bytes32 codeHash = keccak256(abi.encodePacked(discountCode));
    uint256 discount = discountCodes[codeHash];
    
    SubscriptionPlan memory plan = creatorTiers[creator][tierIndex];
    uint256 discountedFee = plan.fee - (plan.fee * discount / 10000);
    
    if (msg.value < discountedFee) revert InsufficientPayment();
    
    // ... distribute fees based on discountedFee
    // ... process subscription
}
```

---

## Branding & White-Labeling

When deploying for a client, update these elements:

### 1. Contract Name

In `subscriptionplatform.sol`, line 29:
```solidity
// Before:
contract SubscriptionPlatform is ReentrancyGuard, Ownable2Step {

// After (client brand):
contract AcmeSubscriptions is ReentrancyGuard, Ownable2Step {
```

### 2. Hardhat Config — Network Names

In `hardhat.config.js`, add the client's preferred RPC:
```javascript
networks: {
    "acme-mainnet": {
        url: process.env.CLIENT_RPC_URL,
        accounts: [process.env.PRIVATE_KEY],
    }
}
```

### 3. Documentation Headers

Replace all occurrences of "SubscriptionPlatform" in the `/docs` folder with the client's product name before handoff. A simple find-and-replace works:

```bash
# Replace in all docs
find ./docs -name "*.md" -exec sed -i 's/SubscriptionPlatform/AcmeSubscriptions/g' {} \;
```

### 4. README Branding

Deliver a clean README to the client with:
- Their logo/product name at the top
- Their deployed contract address
- Their supported tokens
- Their support contact (not yours)

---

## Chainlink Automation Integration

The contract includes `processAutoRenewals()` as a placeholder. Here's how to wire it up properly with Chainlink Automation so renewals execute trustlessly without you running a server.

### Step 1: Add Chainlink-Compatible Interface

```solidity
// Add to your customized contract
interface AutomationCompatibleInterface {
    function checkUpkeep(bytes calldata checkData) 
        external view returns (bool upkeepNeeded, bytes memory performData);
    function performUpkeep(bytes calldata performData) external;
}

// Add to contract:
function checkUpkeep(bytes calldata)
    external view returns (bool upkeepNeeded, bytes memory performData) {
    
    // Build list of subscriptions due for renewal
    address[] memory creatorsToRenew = new address[](10);
    address[] memory usersToRenew = new address[](10);
    uint256 count = 0;
    
    // Your indexing logic here — typically off-chain indexer feeds candidates
    // This is a simplified example
    upkeepNeeded = count > 0;
    performData = abi.encode(creatorsToRenew, usersToRenew, count);
}

function performUpkeep(bytes calldata performData) external {
    (address[] memory creators, address[] memory users, uint256 count) = 
        abi.decode(performData, (address[], address[], uint256));
    
    // Execute renewals for decoded pairs
    for (uint i = 0; i < count; i++) {
        // process renewal for creators[i], users[i]
    }
}
```

### Step 2: Register with Chainlink Automation

1. Go to [automation.chain.link](https://automation.chain.link)
2. Click "Register new Upkeep"
3. Select "Custom Logic"
4. Enter your deployed contract address
5. Fund the upkeep with LINK tokens
6. Set check frequency (recommended: every 6 hours)

**Cost:** Chainlink Automation costs approximately $0.50–2 per upkeep execution in LINK, depending on gas prices. Budget ~$50–100/month for active platforms.

---

## Multi-Client Deployment Pattern

For agencies managing multiple client deployments, use this structure:

```
agency-contracts/
├── clients/
│   ├── acme-corp/
│   │   ├── .env              # Acme's keys/addresses
│   │   ├── deploy-config.js  # Acme's constructor params
│   │   └── DEPLOYMENT.md     # Acme's deployed addresses
│   └── beta-startup/
│       ├── .env
│       ├── deploy-config.js
│       └── DEPLOYMENT.md
├── contracts/
│   └── SubscriptionPlatform.sol  # Shared source
└── scripts/
    └── deploy-client.js          # Parameterized deploy script
```

**Parameterized deploy script:**

```javascript
// scripts/deploy-client.js
const clientConfig = require(`./clients/${process.env.CLIENT}/deploy-config.js`);

async function main() {
    const [deployer] = await ethers.getSigners();
    
    const Contract = await ethers.getContractFactory("SubscriptionPlatform");
    const contract = await Contract.deploy(clientConfig.defaultToken);
    
    await contract.waitForDeployment();
    
    // Apply client config
    await contract.updatePlatformFee(clientConfig.platformFee);
    for (const token of clientConfig.whitelistedTokens) {
        await contract.addWhitelistedToken(token);
    }
    
    console.log(`${clientConfig.clientName} deployed: ${await contract.getAddress()}`);
    
    // Save deployment record
    fs.writeFileSync(
        `./clients/${process.env.CLIENT}/DEPLOYMENT.md`,
        `# ${clientConfig.clientName} Deployment\n\nContract: ${await contract.getAddress()}\nNetwork: ${network.name}\nDeployed: ${new Date().toISOString()}`
    );
}
```

**Usage:**
```bash
CLIENT=acme-corp npx hardhat run scripts/deploy-client.js --network mainnet
```

---

## Subgraph Integration

For agency dashboards showing client analytics (subscriber counts, revenue, churn), index contract events using The Graph.

### schema.graphql

```graphql
type Subscription @entity {
    id: ID!
    user: Bytes!
    creator: Bytes!
    tierIndex: BigInt!
    expiry: BigInt!
    amountPaid: BigInt!
    paymentToken: Bytes!
    timestamp: BigInt!
    active: Boolean!
}

type CreatorStats @entity {
    id: ID!  # creator address
    totalSubscribers: BigInt!
    activeSubscribers: BigInt!
    totalRevenueETH: BigDecimal!
}
```

### subgraph.yaml (key mappings)

```yaml
eventHandlers:
    - event: Subscribed(indexed address, indexed address, uint256, uint256)
      handler: handleSubscribed
    - event: SubscriptionSuspended(indexed address, indexed address, uint256)
      handler: handleSuspended
    - event: FeesDistributed(indexed address, uint256, uint256)
      handler: handleFeesDistributed
```

This gives your clients a real-time dashboard URL they can embed or monitor.

---

## Testing Your Customizations

After any code customization, run the full test suite plus add tests for your changes:

```bash
# Run existing tests
npx hardhat test

# Run with gas profiling (important after adding functions)
REPORT_GAS=true npx hardhat test

# Coverage report — aim for >90% on new functions
npx hardhat coverage
```

### Test template for new functions

```javascript
describe("CustomFeature", function() {
    it("should [expected behavior]", async function() {
        const { contract, owner, creator, subscriber } = await loadFixture(deployFixture);
        
        // Arrange
        // ...
        
        // Act
        const tx = await contract.connect(subscriber).yourNewFunction(...);
        
        // Assert
        expect(await contract.someState()).to.equal(expectedValue);
        await expect(tx).to.emit(contract, "YourEvent").withArgs(...);
    });
    
    it("should revert when [invalid condition]", async function() {
        await expect(
            contract.connect(nonAuthorized).yourNewFunction(...)
        ).to.be.revertedWithCustomError(contract, "YourCustomError");
    });
});
```

---

*Customization guide for SubscriptionPlatform v1.0.0*
*All code snippets are illustrative starting points. Test thoroughly before client deployment.*
