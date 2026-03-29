# Video Tutorial Script
# "Deploy a Web3 Subscription Platform in 15 Minutes"
# =====================================================
# Format: Screen recording + voiceover
# Tools needed: OBS/Loom, terminal, VS Code, browser (MetaMask + Etherscan)
# Target audience: Agencies and developers who just bought the template


# ─────────────────────────────────────────────────────
# PRE-RECORDING SETUP CHECKLIST
# ─────────────────────────────────────────────────────
# [ ] Fresh terminal open in project directory
# [ ] .env file ready with Sepolia keys (testnet only for recording)
# [ ] MetaMask on Sepolia, funded with test ETH
# [ ] Alchemy dashboard tab open (to show RPC setup)
# [ ] Etherscan Sepolia tab ready (sepolia.etherscan.io)
# [ ] Font size bumped up in VS Code and terminal (accessibility)
# [ ] Clear browser history / private window (no personal tabs visible)
# [ ] Mic tested, notifications silenced


# ─────────────────────────────────────────────────────
# SEGMENT 1 — INTRO (0:00–1:00)
# ─────────────────────────────────────────────────────
# SCREEN: Repo README / Gumroad product page
# DURATION: ~60 seconds

SCRIPT:
"In this video I'm going to deploy a full Web3 subscription platform
from scratch — a contract that accepts ETH and USDC, manages multiple
pricing tiers, and handles the full subscription lifecycle.

We're going to do it in about 15 minutes, on Sepolia testnet,
and by the end you'll have a live contract you can immediately
integrate into a frontend or hand off to a client.

Let's go."

[Show repo file structure briefly — 5 seconds]
"Here's everything in the package — the contract, tests, deployment
scripts, and the docs we'll reference a couple times.
Let's start with setup."


# ─────────────────────────────────────────────────────
# SEGMENT 2 — PROJECT SETUP (1:00–3:00)
# ─────────────────────────────────────────────────────
# SCREEN: Terminal
# DURATION: ~2 minutes

SCRIPT:
"First, install dependencies."

[TYPE IN TERMINAL:]
npm install

"While that runs — if you don't have an Alchemy account, go to
dashboard.alchemy.com and create a free one. We need an RPC URL
for Sepolia. Takes about 2 minutes."

[Show Alchemy dashboard briefly — create an app, copy the HTTPS URL]
"Copy your HTTPS URL — we'll paste it into the .env file."

[In VS Code, open .env.example]
"Copy this to .env..."

[TYPE:]
cp .env.example .env

[Open .env in VS Code]
"Three things to fill in:
— Your wallet's private key. Export it from MetaMask.
  Use a test wallet, not your main one.
— Your Alchemy API key — paste it here.
— The default token address. For Sepolia, I'll use the test USDC address
  which is in the QUICK_START doc."

[Fill in .env values, blur the private key on screen]
"Good. Let's compile."

[TYPE:]
npx hardhat compile

"Clean compile. Now deploy."


# ─────────────────────────────────────────────────────
# SEGMENT 3 — DEPLOY (3:00–5:30)
# ─────────────────────────────────────────────────────
# SCREEN: Terminal → Etherscan
# DURATION: ~2.5 minutes

SCRIPT:
[TYPE:]
npx hardhat run scripts/deploy.js --network sepolia

"This takes about 30 seconds. The deployment script broadcasts the
transaction, waits for confirmation, and prints your contract address."

[Contract deploys — output shows address]
"There it is. Copy that address — everything from here uses it."

[Open Etherscan Sepolia, paste address]
"Let's verify it on Etherscan so the source code is public.
This matters for client trust and for anyone integrating with your contract."

[TYPE in terminal:]
npx hardhat verify --network sepolia [CONTRACT_ADDRESS] "[TOKEN_ADDRESS]"

"Verification takes about 20 seconds. Once confirmed, anyone can read
the exact contract code on Etherscan — no black boxes."

[Show Etherscan — contract tab with green checkmark]
"Green checkmark. Source code is live."


# ─────────────────────────────────────────────────────
# SEGMENT 4 — CONFIGURE WITH WIZARD (5:30–9:00)
# ─────────────────────────────────────────────────────
# SCREEN: Terminal running configure.js
# DURATION: ~3.5 minutes

SCRIPT:
"Now I'll run the setup wizard to configure the contract — set the
platform fee, add a payment token, and create two subscription plans."

[TYPE:]
npx hardhat run scripts/configure.js --network sepolia

[Wizard starts — walk through each prompt]

"It's asking for the contract address — paste it in."
[Paste address]

"Platform fee — I'll keep the default 5%."
[Press Enter / n to skip]

"Now it's asking about whitelisted tokens. The default token is already
added in the constructor. I'll add Sepolia USDC as well so we can
accept stablecoin payments."
[Enter USDC address, confirm]

"Creator setup — the deployer wallet is already a creator, so I'll
skip the extra one for now."

"Now the plans. I'll create a Basic Monthly and a Pro Annual."

[Create Plan 1:]
"Basic Monthly — 0.01 ETH per month, 20 USDC equivalent, 30 days, active."

[Create Plan 2:]
"Pro Annual — 0.08 ETH, 160 USDC, 365 days, active."

[Wizard saves config to deployments/ folder]

"The wizard saved a JSON record of everything we just configured — 
contract address, network, plans, tokens. Useful if you're managing
multiple client deployments."

[Show the generated integration snippet at the end of wizard output]
"And here's the integration snippet — two constants you paste into
your frontend. That's literally all you need to start gating content."


# ─────────────────────────────────────────────────────
# SEGMENT 5 — TEST A SUBSCRIPTION (9:00–11:30)
# ─────────────────────────────────────────────────────
# SCREEN: Terminal → Etherscan
# DURATION: ~2.5 minutes

SCRIPT:
"Let's verify the whole flow works — subscribe, check access, done."

[Open or create test-subscribe.js — the one from QUICK_START]
"I have this quick test script from the QUICK_START doc. It subscribes
to tier 0, then checks if the subscription is active."

[TYPE:]
npx hardhat run scripts/test-subscribe.js --network sepolia

[Output shows:]
"Active before: false
Subscribing...
Transaction: 0xabc...
Active after: true
Expires: [date]"

"Active. And there's the expiry date — 30 days from now."

[Open Etherscan, show the transaction]
"Here's that transaction on Etherscan. You can see the ETH was sent,
the fee split happened — 95% to the creator, 5% platform fee — all
in one atomic transaction. The creator never has to do a separate
withdraw."

[Show the Subscribed event in the logs]
"The Subscribed event is emitted with user address, creator address,
tier index, and expiry timestamp. Your frontend or backend can listen
for this event to trigger downstream actions — send a welcome email,
provision access, mint an NFT, whatever."


# ─────────────────────────────────────────────────────
# SEGMENT 6 — FRONTEND INTEGRATION SNIPPET (11:30–13:30)
# ─────────────────────────────────────────────────────
# SCREEN: VS Code — EXAMPLES.md
# DURATION: ~2 minutes

SCRIPT:
"I'm not going to build a full frontend in this video — that's a
separate tutorial. But let me show you exactly how simple the
integration is."

[Open docs/EXAMPLES.md, scroll to Backend Verification section]
"This is the Express middleware. It's 40 lines. You drop this into
any Node.js backend and every route you protect with it checks
the user's wallet against the contract."

[Highlight the key line:]
"This one call — isSubscriptionActive — is the entire gate.
True means they're a subscriber. False means they're not.
Your backend doesn't need to know anything else."

[Scroll to the React component]
"And on the frontend, this SubscriptionGate component wraps any
content you want to protect. Pass it the user's wallet address,
it checks the contract, renders the content or the subscribe button."

"The full snippets — React, Next.js middleware, ethers.js v6, wagmi —
are all in EXAMPLES.md. Copy, adapt, ship."


# ─────────────────────────────────────────────────────
# SEGMENT 7 — CUSTOMIZATION OVERVIEW (13:30–14:30)
# ─────────────────────────────────────────────────────
# SCREEN: VS Code — CUSTOMIZATION.md
# DURATION: ~1 minute

SCRIPT:
"Last thing — the customization guide, because every client is different."

[Open CUSTOMIZATION.md, scroll through scenario headers]
"Five client scenarios with working code: SaaS API billing, content
creator tiers, B2B team licenses, NFT-gated access, USDC-only platforms."

"Most customizations are zero Solidity — just configuration.
For the ones that need code changes, there are drop-in snippets for
referrals, discount codes, team seats, and Chainlink Automation
for auto-renewals."

"The contract is MIT licensed. Customize it, white-label it,
deploy it for clients — it's yours."


# ─────────────────────────────────────────────────────
# SEGMENT 8 — WRAP UP (14:30–15:00)
# ─────────────────────────────────────────────────────
# SCREEN: Etherscan verified contract + terminal
# DURATION: ~30 seconds

SCRIPT:
"That's it. In 15 minutes:
— Contract deployed and verified on Etherscan
— Two subscription tiers configured
— Payment flow tested end to end
— Integration snippet ready for your frontend

All the docs are in the /docs folder. Start with QUICK_START,
then CUSTOMIZATION when you're ready to adapt it for a client.

If you run into anything, there's a TROUBLESHOOTING doc that covers
every common error, and GitHub Issues for anything else.

Good luck with the build."

[End screen: contract address on Etherscan, repo URL]


# ─────────────────────────────────────────────────────
# POST-PRODUCTION NOTES
# ─────────────────────────────────────────────────────

Upload destinations:
- Gumroad: embed or link on product page (boosts conversion)
- YouTube: unlisted, link from Gumroad and GitHub README
- GitHub README: add a "Watch the 15-min setup video" link

Thumbnail text: "Deploy Web3 Subscriptions in 15 min"
Thumbnail style: Dark background, terminal screenshot, timer graphic

Chapters to add in YouTube description:
  0:00 Intro
  1:00 Project setup & .env config
  3:00 Deploy to Sepolia
  5:30 Configure with setup wizard
  9:00 Test the subscription flow
  11:30 Frontend integration
  13:30 Customization overview
  14:30 Wrap up
