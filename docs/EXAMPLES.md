# Integration Examples

> **Production-ready code snippets** for the most common integration patterns. Copy, adapt, and ship.

---

## Table of Contents

- [Frontend Integration (React/Next.js)](#frontend-integration-reactnextjs)
- [Backend Verification (Node.js)](#backend-verification-nodejs)
- [Content Gating Patterns](#content-gating-patterns)
- [Subscription Dashboard](#subscription-dashboard)
- [ERC20 Payment Flow](#erc20-payment-flow)
- [Event Listening & Webhooks](#event-listening--webhooks)
- [Ethers.js v6 Snippets](#ethersjs-v6-snippets)
- [viem / wagmi Snippets](#viem--wagmi-snippets)

---

## Frontend Integration (React/Next.js)

### Complete Subscription Widget

A full subscribe button component with plan loading, wallet connection, and transaction handling:

```tsx
// components/SubscribeButton.tsx
import { useState, useEffect } from "react";
import { ethers } from "ethers";

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!;
const CREATOR_ADDRESS = process.env.NEXT_PUBLIC_CREATOR_ADDRESS!;

const ABI = [
  "function subscribe(address creator, uint256 tierIndex) payable",
  "function subscribeWithToken(address creator, uint256 tierIndex, address token)",
  "function isSubscriptionActive(address creator, address user) view returns (bool)",
  "function getCreatorTiersCount(address creator) view returns (uint256)",
  "function getCreatorTier(address creator, uint256 tierIndex) view returns (tuple(uint256 fee, uint256 tokenFee, uint256 duration, string metadata, string benefits, bool active))",
  "function getSubscriptionExpiry(address creator, address user) view returns (uint256)",
];

interface Plan {
  index: number;
  fee: bigint;
  tokenFee: bigint;
  duration: bigint;
  metadata: string;
  benefits: string;
  active: boolean;
}

export function SubscribeButton({ userAddress }: { userAddress: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [expiry, setExpiry] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState(0);

  useEffect(() => {
    loadData();
  }, [userAddress]);

  async function loadData() {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    // Load subscription status
    const active = await contract.isSubscriptionActive(CREATOR_ADDRESS, userAddress);
    setIsActive(active);

    if (active) {
      const exp = await contract.getSubscriptionExpiry(CREATOR_ADDRESS, userAddress);
      setExpiry(new Date(Number(exp) * 1000));
    }

    // Load available plans
    const count = await contract.getCreatorTiersCount(CREATOR_ADDRESS);
    const loadedPlans: Plan[] = [];
    for (let i = 0; i < Number(count); i++) {
      const plan = await contract.getCreatorTier(CREATOR_ADDRESS, i);
      if (plan.active) {
        loadedPlans.push({ index: i, ...plan });
      }
    }
    setPlans(loadedPlans);
  }

  async function handleSubscribe() {
    setLoading(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      const plan = plans[selectedTier];
      const tx = await contract.subscribe(CREATOR_ADDRESS, plan.index, {
        value: plan.fee,
      });
      await tx.wait();
      await loadData(); // Refresh state
    } catch (err: any) {
      console.error("Subscription failed:", err.reason || err.message);
    } finally {
      setLoading(false);
    }
  }

  if (isActive) {
    return (
      <div className="subscription-active">
        <span>✅ Active until {expiry?.toLocaleDateString()}</span>
      </div>
    );
  }

  return (
    <div className="subscribe-widget">
      <select onChange={(e) => setSelectedTier(Number(e.target.value))}>
        {plans.map((plan, i) => (
          <option key={i} value={i}>
            {plan.metadata} — {ethers.formatEther(plan.fee)} ETH
          </option>
        ))}
      </select>

      <button onClick={handleSubscribe} disabled={loading}>
        {loading ? "Processing..." : `Subscribe — ${ethers.formatEther(plans[selectedTier]?.fee || 0n)} ETH`}
      </button>

      {plans[selectedTier] && (
        <p className="benefits">{plans[selectedTier].benefits}</p>
      )}
    </div>
  );
}
```

---

### Access Gate Component (Wrap Protected Content)

```tsx
// components/SubscriptionGate.tsx
import { useEffect, useState } from "react";
import { ethers } from "ethers";

export function SubscriptionGate({
  userAddress,
  children,
  fallback,
}: {
  userAddress: string | null;
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userAddress) {
      setHasAccess(false);
      return;
    }
    checkAccess(userAddress).then(setHasAccess);
  }, [userAddress]);

  if (hasAccess === null) return <div>Checking access...</div>;
  if (!hasAccess) return <>{fallback}</>;
  return <>{children}</>;
}

async function checkAccess(userAddress: string): Promise<boolean> {
  const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
  const contract = new ethers.Contract(
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS!,
    ["function isSubscriptionActive(address creator, address user) view returns (bool)"],
    provider
  );
  return contract.isSubscriptionActive(
    process.env.NEXT_PUBLIC_CREATOR_ADDRESS!,
    userAddress
  );
}

// Usage:
// <SubscriptionGate userAddress={wallet} fallback={<SubscribeButton />}>
//   <PremiumContent />
// </SubscriptionGate>
```

---

## Backend Verification (Node.js)

### API Middleware — Express.js

Protect any API route by verifying subscription status server-side:

```javascript
// middleware/requireSubscription.js
const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const contract = new ethers.Contract(
  process.env.CONTRACT_ADDRESS,
  ["function isSubscriptionActive(address creator, address user) view returns (bool)"],
  provider
);

// Cache to avoid hammering RPC on every request
const cache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute

async function requireSubscription(req, res, next) {
  const walletAddress = req.headers["x-wallet-address"];

  if (!walletAddress || !ethers.isAddress(walletAddress)) {
    return res.status(401).json({ error: "Valid wallet address required" });
  }

  const cacheKey = walletAddress.toLowerCase();
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    if (!cached.active) return res.status(403).json({ error: "Subscription required" });
    return next();
  }

  try {
    const isActive = await contract.isSubscriptionActive(
      process.env.CREATOR_ADDRESS,
      walletAddress
    );

    cache.set(cacheKey, { active: isActive, timestamp: Date.now() });

    if (!isActive) {
      return res.status(403).json({ 
        error: "Active subscription required",
        subscribeUrl: process.env.SUBSCRIPTION_PAGE_URL
      });
    }

    next();
  } catch (err) {
    console.error("Subscription check failed:", err);
    res.status(500).json({ error: "Could not verify subscription" });
  }
}

module.exports = { requireSubscription };

// Usage in routes:
// app.get("/api/premium-data", requireSubscription, (req, res) => { ... });
```

### Verify with Signed Message (No Wallet Header Required)

For APIs where clients prove wallet ownership via signature:

```javascript
// middleware/verifySignedSubscription.js
const { ethers } = require("ethers");

async function verifySignedSubscription(req, res, next) {
  const { message, signature } = req.body;

  try {
    // Recover the wallet address from signature
    const walletAddress = ethers.verifyMessage(message, signature);

    // Verify the message contains the expected nonce/timestamp (prevent replay)
    const parsed = JSON.parse(message);
    if (Date.now() - parsed.timestamp > 5 * 60 * 1000) {
      return res.status(401).json({ error: "Signature expired" });
    }

    // Check subscription
    const isActive = await contract.isSubscriptionActive(
      process.env.CREATOR_ADDRESS,
      walletAddress
    );

    if (!isActive) {
      return res.status(403).json({ error: "No active subscription" });
    }

    req.walletAddress = walletAddress;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid signature" });
  }
}

// Client-side signing:
// const message = JSON.stringify({ action: "access", timestamp: Date.now() });
// const signature = await signer.signMessage(message);
// fetch("/api/data", { method: "POST", body: JSON.stringify({ message, signature }) });
```

---

## Content Gating Patterns

### Next.js API Route Protection

```javascript
// pages/api/premium/[...slug].js
import { ethers } from "ethers";

export default async function handler(req, res) {
  const walletAddress = req.headers["x-wallet-address"];
  
  if (!walletAddress) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const hasAccess = await checkSubscription(walletAddress);
  
  if (!hasAccess) {
    return res.status(403).json({ 
      error: "Premium subscription required",
      action: "subscribe"
    });
  }

  // Serve premium content
  const content = await getPremiumContent(req.query.slug);
  res.json(content);
}
```

### Next.js Middleware (Edge Runtime)

For large Next.js apps, gate entire route groups at the edge:

```javascript
// middleware.js
import { NextResponse } from "next/server";
import { ethers } from "ethers";

export async function middleware(request) {
  // Only apply to /premium/* routes
  if (!request.nextUrl.pathname.startsWith("/premium")) {
    return NextResponse.next();
  }

  const walletCookie = request.cookies.get("wallet_address")?.value;

  if (!walletCookie) {
    return NextResponse.redirect(new URL("/subscribe", request.url));
  }

  // For edge runtime, use a lightweight RPC call
  const isActive = await checkSubscriptionEdge(walletCookie);

  if (!isActive) {
    return NextResponse.redirect(new URL("/subscribe", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/premium/:path*"],
};
```

---

## Subscription Dashboard

Full dashboard showing a user's active subscriptions, history, and management options:

```tsx
// pages/dashboard.tsx
import { useEffect, useState } from "react";
import { ethers } from "ethers";

interface ActiveSub {
  creator: string;
  expiry: Date;
  daysRemaining: number;
}

export function SubscriptionDashboard({ userAddress }: { userAddress: string }) {
  const [activeSubs, setActiveSubs] = useState<ActiveSub[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    loadDashboard();
  }, [userAddress]);

  async function loadDashboard() {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, FULL_ABI, provider);

    // Get all active subscriptions
    const [creators, expiries] = await contract.getUserActiveSubscriptions(userAddress);
    const now = Date.now() / 1000;

    const subs = creators.map((creator: string, i: number) => ({
      creator,
      expiry: new Date(Number(expiries[i]) * 1000),
      daysRemaining: Math.max(0, Math.floor((Number(expiries[i]) - now) / 86400)),
    }));
    setActiveSubs(subs.filter((s: ActiveSub) => s.daysRemaining > 0));

    // Get subscription history
    const hist = await contract.getSubscriptionHistory(userAddress);
    setHistory(hist);
  }

  async function handleSuspend(creatorAddress: string) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, FULL_ABI, signer);
    const tx = await contract.suspendSubscription(creatorAddress);
    await tx.wait();
    await loadDashboard();
  }

  return (
    <div>
      <h2>Your Subscriptions</h2>
      {activeSubs.length === 0 && <p>No active subscriptions.</p>}
      {activeSubs.map((sub) => (
        <div key={sub.creator} className="subscription-card">
          <p>Creator: {sub.creator.slice(0, 6)}...{sub.creator.slice(-4)}</p>
          <p>Expires: {sub.expiry.toLocaleDateString()}</p>
          <p>{sub.daysRemaining} days remaining</p>
          {sub.daysRemaining < 7 && (
            <span className="badge warning">Expiring soon</span>
          )}
          <button onClick={() => handleSuspend(sub.creator)}>Suspend</button>
        </div>
      ))}

      <h2>Transaction History</h2>
      {history.map((record, i) => (
        <div key={i} className="history-row">
          <span>{new Date(Number(record.startTime) * 1000).toLocaleDateString()}</span>
          <span>{record.paymentToken === ethers.ZeroAddress ? "ETH" : "Token"}</span>
          <span>
            {record.paymentToken === ethers.ZeroAddress
              ? `${ethers.formatEther(record.amountPaid)} ETH`
              : `${ethers.formatUnits(record.amountPaid, 6)} USDC`}
          </span>
        </div>
      ))}
    </div>
  );
}
```

---

## ERC20 Payment Flow

Complete flow: check allowance → approve if needed → subscribe with token:

```javascript
// utils/subscribeWithToken.js
const { ethers } = require("ethers");

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

async function subscribeWithToken(
  signer,
  contractAddress,
  creatorAddress,
  tierIndex,
  tokenAddress
) {
  const contract = new ethers.Contract(contractAddress, SUBSCRIPTION_ABI, signer);
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const userAddress = await signer.getAddress();

  // Get the required fee
  const plan = await contract.getCreatorTier(creatorAddress, tierIndex);
  const requiredAmount = plan.tokenFee;

  // Check current allowance
  const currentAllowance = await token.allowance(userAddress, contractAddress);

  // Approve if needed
  if (currentAllowance < requiredAmount) {
    console.log("Approving token spend...");
    const approveTx = await token.approve(contractAddress, requiredAmount);
    await approveTx.wait();
    console.log("Approval confirmed");
  }

  // Subscribe
  console.log("Subscribing...");
  const tx = await contract.subscribeWithToken(creatorAddress, tierIndex, tokenAddress);
  const receipt = await tx.wait();
  
  console.log("Subscription confirmed:", receipt.hash);
  return receipt;
}

// Usage:
// await subscribeWithToken(signer, contractAddr, creatorAddr, 0, usdcAddr);
```

---

## Event Listening & Webhooks

### Listen for New Subscriptions

```javascript
// scripts/listen-events.js
const { ethers } = require("ethers");

const provider = new ethers.WebSocketProvider(process.env.WSS_RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

// Fire webhook when someone subscribes
contract.on("Subscribed", async (user, creator, tierIndex, expiry, event) => {
  console.log(`New subscriber: ${user} → ${creator} (tier ${tierIndex})`);
  
  // Send to your backend/webhook
  await fetch(process.env.WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "new_subscription",
      user,
      creator,
      tierIndex: tierIndex.toString(),
      expiry: new Date(Number(expiry) * 1000).toISOString(),
      txHash: event.transactionHash,
    }),
  });
});

// Alert when subscription is suspended
contract.on("SubscriptionSuspended", (user, creator, expiry) => {
  console.log(`Subscription suspended: ${user} (expires ${new Date(Number(expiry) * 1000)})`);
});

console.log("Listening for subscription events...");
```

### Batch Historical Event Query

```javascript
// Get all subscriptions for a creator in the last 30 days
async function getCreatorSubscriptions(creatorAddress, daysBack = 30) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  const currentBlock = await provider.getBlockNumber();
  const blocksPerDay = 7200; // ~12s block time on Ethereum
  const fromBlock = currentBlock - (blocksPerDay * daysBack);

  // Filter by indexed creator param
  const filter = contract.filters.Subscribed(null, creatorAddress);
  const events = await contract.queryFilter(filter, fromBlock, currentBlock);

  return events.map(e => ({
    user: e.args.user,
    tierIndex: e.args.tierIndex.toString(),
    expiry: new Date(Number(e.args.expiry) * 1000),
    txHash: e.transactionHash,
    blockNumber: e.blockNumber,
  }));
}
```

---

## Ethers.js v6 Snippets

Quick reference for the most common operations:

```javascript
const { ethers } = require("ethers");

// Setup
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

// Read: check subscription
const active = await contract.isSubscriptionActive(creator, user);

// Read: get expiry as Date
const expiry = await contract.getSubscriptionExpiry(creator, user);
const expiryDate = new Date(Number(expiry) * 1000);

// Write: subscribe with ETH
const plan = await contract.getCreatorTier(creator, 0);
const tx = await contract.subscribe(creator, 0, { value: plan.fee });
const receipt = await tx.wait();

// Write: approve + subscribe with token
await tokenContract.approve(CONTRACT_ADDRESS, plan.tokenFee);
const tx2 = await contract.subscribeWithToken(creator, 0, TOKEN_ADDRESS);
await tx2.wait();

// Parse ETH values
console.log(ethers.formatEther(plan.fee));        // "0.01"
console.log(ethers.parseEther("0.01"));           // 10000000000000000n

// Parse token values (USDC = 6 decimals)
console.log(ethers.formatUnits(plan.tokenFee, 6)); // "20.0"
console.log(ethers.parseUnits("20", 6));           // 20000000n
```

---

## viem / wagmi Snippets

For agencies building with the wagmi/viem stack (common in modern Next.js apps):

```typescript
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { mainnet } from "viem/chains";
import { useWriteContract, useReadContract } from "wagmi";

// Read: check subscription status
const { data: isActive } = useReadContract({
  address: CONTRACT_ADDRESS,
  abi: SUBSCRIPTION_ABI,
  functionName: "isSubscriptionActive",
  args: [creatorAddress, userAddress],
});

// Read: get plan details
const { data: plan } = useReadContract({
  address: CONTRACT_ADDRESS,
  abi: SUBSCRIPTION_ABI,
  functionName: "getCreatorTier",
  args: [creatorAddress, BigInt(0)],
});

// Write: subscribe
const { writeContract, isPending } = useWriteContract();

function handleSubscribe() {
  writeContract({
    address: CONTRACT_ADDRESS,
    abi: SUBSCRIPTION_ABI,
    functionName: "subscribe",
    args: [creatorAddress, BigInt(0)],
    value: plan?.fee,
  });
}

// Subscribe button:
// <button onClick={handleSubscribe} disabled={isPending}>
//   {isPending ? "Confirming..." : `Subscribe — ${formatEther(plan?.fee ?? 0n)} ETH`}
// </button>
```

---

*Integration examples for SubscriptionPlatform v1.0.0*
*All snippets use ethers.js v6 syntax unless noted. Adapt addresses and ABIs to your deployment.*
