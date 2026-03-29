# SubscriptionPlatform Smart Contract

> **Production-ready Solidity template for agencies and developers who need Web3 subscription infrastructure without building from scratch.**

Deploy a full subscription platform on any EVM chain in under 30 minutes. Multi-tier plans, ETH + ERC20 payments, automatic fee distribution, and complete subscription lifecycle management — all in 636 lines of audited Solidity.

---

## Why This Template

Building subscription logic from scratch takes 2–3 weeks. This template is those weeks, already done.

- **Agencies** — deliver Web3 subscription platforms to clients in days, not weeks. Bill confidently with production-grade code.
- **Developers** — skip the boilerplate and focus on your product. Everything from fee splits to grace periods is handled.
- **Startups** — launch a monetized platform fast, on any EVM chain, with full ownership of your infrastructure.

---

## Features

- **Multi-tier subscriptions** — up to 10 pricing tiers per creator (free, monthly, annual, enterprise — any structure)
- **Dual payment support** — accept ETH and any whitelisted ERC20 token (USDC, USDT, WETH, or your own)
- **Atomic fee distribution** — platform fee and creator share split instantly at subscription time, no withdrawal step
- **Full lifecycle management** — subscribe, suspend, reactivate, cancel, auto-renewal flags
- **Grace period system** — configurable buffer after expiry (default 7 days)
- **Creator analytics** — lifetime earnings and subscriber tracking on-chain
- **Enterprise security** — ReentrancyGuard, Ownable2Step, SafeERC20, 21 custom errors, emergency pause
- **EVM compatible** — deploy to Ethereum, Polygon, Arbitrum, Base, BNB Chain with zero code changes

---

## Quick Start

```bash
git clone https://github.com/osaisonomwanmarvis/Decentralized-Subscription-Smart-Contract.git
cd Decentralized-Subscription-Smart-Contract
npm install
cp .env.example .env   # fill in your RPC URL and private key
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

Then run the interactive setup wizard:

```bash
npx hardhat run scripts/configure.js --network sepolia
```

See [docs/QUICK_START.md](docs/QUICK_START.md) for the full step-by-step guide including Etherscan verification and frontend integration.

---

## Contract Architecture

```
SubscriptionPlatform
├── Creator Management       — whitelist creators, manage roles
├── Subscription Plans       — multi-tier config, metadata, benefits
├── Payment Processing       — ETH + ERC20, atomic fee distribution
├── Subscription Lifecycle   — suspend, reactivate, auto-renewal
└── Platform Administration  — fee control, token whitelist, emergency controls
```

**Dependencies:** OpenZeppelin ^4.8.0 (ReentrancyGuard, Ownable2Step, SafeERC20)  
**Solidity:** ^0.8.20  
**License:** MIT

---

## Integration

Check subscription status in your backend (Node.js):

```javascript
const { ethers } = require("ethers");

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, [
  "function isSubscriptionActive(address creator, address user) view returns (bool)"
], provider);

const hasAccess = await contract.isSubscriptionActive(CREATOR_ADDRESS, userWallet);
```

See [docs/EXAMPLES.md](docs/EXAMPLES.md) for React, Next.js, Express middleware, ethers.js v6, and wagmi snippets.

---

## Documentation

| Guide | Description |
|---|---|
| [Quick Start](docs/QUICK_START.md) | Deploy in 30 minutes, step by step |
| [Architecture](docs/ARCHITECTURE.md) | System design, data flow, state machine diagrams |
| [Functions](docs/FUNCTIONS.md) | Complete API reference for every function |
| [Security](docs/SECURITY.md) | Threat model, attack vectors, audit checklist |
| [Customization](docs/CUSTOMIZATION.md) | 5 client scenario blueprints with code |
| [Examples](docs/EXAMPLES.md) | Frontend + backend integration snippets |
| [Gas Optimization](docs/GAS_OPTIMIZATION.md) | Cost tables, L2 guide, client proposals |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Every common error with exact fixes |

---

## Key Contract Details

| Property | Value |
|---|---|
| Platform fee | 5% default, configurable 0–10% |
| Max tiers per creator | 10 |
| Subscription duration | 1–365 days |
| Grace period | 7 days (after expiry) |
| History records per user | 100 (auto-evicted FIFO) |
| Payment types | ETH + whitelisted ERC20 |

---

## Security

- Reentrancy protection on all fund-moving functions (`nonReentrant`)
- Two-step ownership transfer (`Ownable2Step`) — prevents accidental transfers
- Safe ERC20 transfers (`SafeERC20`) — handles non-standard tokens
- 21 custom errors — gas-optimized vs string reverts
- Hard cap on platform fee (10% maximum, enforced in contract)
- Emergency pause + full withdrawal controls

See [docs/SECURITY.md](docs/SECURITY.md) for full threat model and audit checklist.

---

## Supported Networks

Deploy with zero code changes to any EVM-compatible chain:

| Network | Deploy Cost | Subscribe Cost |
|---|---|---|
| Ethereum Mainnet | ~$150–400 | ~$8–15 per tx |
| Arbitrum One | ~$1–5 | ~$0.10–0.50 per tx |
| Base | ~$0.50–3 | ~$0.05–0.20 per tx |
| Polygon | ~$0.10–0.50 | ~$0.01–0.05 per tx |

---

## Running Tests

```bash
# Run full test suite
npx hardhat test

# With gas usage report
REPORT_GAS=true npx hardhat test

# Coverage report
npx hardhat coverage
```

---

## License

MIT — use in unlimited commercial and client projects. No royalties, no attribution required.

---

## Support

- **Documentation:** Start with [docs/QUICK_START.md](docs/QUICK_START.md)
- **Common errors:** See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- **Issues:** [Open a GitHub issue](https://github.com/osaisonomwanmarvis/Decentralized-Subscription-Smart-Contract/issues)
