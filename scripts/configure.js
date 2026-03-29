#!/usr/bin/env node
/**
 * SubscriptionPlatform — Post-Deployment Configuration Helper
 * ============================================================
 * Run this after deploying your contract to set up your first
 * creator, subscription plans, and whitelisted tokens interactively.
 *
 * Usage:
 *   node scripts/configure.js
 *
 * Or with Hardhat (recommended — uses your hardhat.config.js networks):
 *   npx hardhat run scripts/configure.js --network sepolia
 *   npx hardhat run scripts/configure.js --network mainnet
 */

const { ethers } = require("hardhat");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(`\n${question} `, resolve));
}

function askWithDefault(question, defaultValue) {
  return new Promise((resolve) =>
    rl.question(`\n${question} [${defaultValue}]: `, (answer) =>
      resolve(answer.trim() || defaultValue)
    )
  );
}

function separator(title) {
  const line = "─".repeat(50);
  console.log(`\n${line}`);
  if (title) console.log(`  ${title}`);
  console.log(line);
}

function success(msg) {
  console.log(`  ✅  ${msg}`);
}

function info(msg) {
  console.log(`  ℹ️   ${msg}`);
}

function warn(msg) {
  console.log(`  ⚠️   ${msg}`);
}

async function confirm(question) {
  const answer = await ask(`${question} (y/n):`);
  return answer.toLowerCase().startsWith("y");
}

function daysToSeconds(days) {
  return Math.floor(days * 24 * 60 * 60);
}

function saveDeploymentRecord(data) {
  const deploymentsDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir);

  const filename = path.join(
    deploymentsDir,
    `${data.network}-${Date.now()}.json`
  );
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
  return filename;
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   SubscriptionPlatform — Setup Wizard            ║");
  console.log("║   Post-deployment configuration helper           ║");
  console.log("╚══════════════════════════════════════════════════╝");

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  separator("Connection Info");
  info(`Network:  ${network.name} (chainId: ${network.chainId})`);
  info(`Wallet:   ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  info(`Balance:  ${ethers.formatEther(balance)} ETH`);

  if (balance < ethers.parseEther("0.01")) {
    warn("Low balance! You may not have enough ETH for configuration transactions.");
  }

  // ── Step 1: Contract Address ──────────────────────────────
  separator("Step 1 — Connect to Deployed Contract");

  let contractAddress = process.env.CONTRACT_ADDRESS;

  if (!contractAddress) {
    contractAddress = await ask("Enter your deployed contract address:");
  } else {
    info(`Using CONTRACT_ADDRESS from .env: ${contractAddress}`);
  }

  if (!ethers.isAddress(contractAddress)) {
    console.error("\n❌ Invalid contract address. Exiting.");
    process.exit(1);
  }

  const contract = await ethers.getContractAt(
    "SubscriptionPlatform",
    contractAddress
  );

  // Verify we can talk to it
  try {
    const owner = await contract.owner();
    const fee = await contract.platformFeePercent();
    success(`Contract connected. Owner: ${owner}`);
    info(`Current platform fee: ${Number(fee) / 100}%`);

    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      warn("WARNING: Your wallet is NOT the contract owner.");
      warn("Owner-only functions will fail.");
      const proceed = await confirm("Continue anyway?");
      if (!proceed) process.exit(0);
    }
  } catch {
    console.error("\n❌ Could not connect to contract. Is the address correct?");
    process.exit(1);
  }

  const deploymentData = {
    network: network.name,
    chainId: network.chainId.toString(),
    contractAddress,
    owner: deployer.address,
    configuredAt: new Date().toISOString(),
    plans: [],
    whitelistedTokens: [],
  };

  // ── Step 2: Platform Fee ──────────────────────────────────
  separator("Step 2 — Platform Fee");

  const currentFee = await contract.platformFeePercent();
  info(`Current fee: ${Number(currentFee) / 100}% (${currentFee} basis points)`);
  info("Range: 0% (free) to 10% (max). Default is 5%.");

  const changeFee = await confirm("Change platform fee?");
  if (changeFee) {
    const feeInput = await askWithDefault(
      "New fee percentage (e.g. 5 for 5%, 2.5 for 2.5%):",
      "5"
    );
    const feeBps = Math.round(parseFloat(feeInput) * 100);

    if (feeBps < 0 || feeBps > 1000) {
      warn("Fee must be between 0% and 10%. Skipping.");
    } else {
      const tx = await contract.updatePlatformFee(feeBps);
      await tx.wait();
      success(`Platform fee set to ${feeInput}% (${feeBps} basis points)`);
      deploymentData.platformFee = `${feeInput}%`;
    }
  } else {
    info("Keeping current fee.");
  }

  // ── Step 3: Whitelist Tokens ──────────────────────────────
  separator("Step 3 — ERC20 Token Whitelist");

  info("Add ERC20 tokens you want to accept as payment (e.g. USDC, USDT).");
  info("The default token from deployment is already whitelisted.");

  const addTokens = await confirm("Add more whitelisted tokens?");
  if (addTokens) {
    let addingTokens = true;
    while (addingTokens) {
      const tokenAddr = await ask("Token contract address (or press Enter to skip):");
      if (!tokenAddr.trim()) {
        addingTokens = false;
        break;
      }

      if (!ethers.isAddress(tokenAddr)) {
        warn("Invalid address, skipping.");
        continue;
      }

      const alreadyWhitelisted = await contract.whitelistedTokens(tokenAddr);
      if (alreadyWhitelisted) {
        info("Token already whitelisted.");
      } else {
        const tx = await contract.addWhitelistedToken(tokenAddr);
        await tx.wait();
        success(`Token whitelisted: ${tokenAddr}`);
        deploymentData.whitelistedTokens.push(tokenAddr);
      }

      addingTokens = await confirm("Add another token?");
    }
  }

  // ── Step 4: Register Creator ──────────────────────────────
  separator("Step 4 — Creator Setup");

  info("The deployer wallet is already a creator.");
  info("To add a separate creator wallet (e.g. a client's address), enter it below.");

  const addCreator = await confirm("Register an additional creator address?");
  if (addCreator) {
    const creatorAddr = await ask("Creator wallet address:");

    if (!ethers.isAddress(creatorAddr)) {
      warn("Invalid address, skipping.");
    } else {
      const isAlready = await contract.creators(creatorAddr);
      if (isAlready) {
        info("This address is already a creator.");
      } else {
        const tx = await contract.addCreator(creatorAddr);
        await tx.wait();
        success(`Creator registered: ${creatorAddr}`);
        deploymentData.additionalCreator = creatorAddr;
      }
    }
  }

  // ── Step 5: Subscription Plans ───────────────────────────
  separator("Step 5 — Subscription Plans");

  info("Create your subscription tiers. You can have up to 10.");
  info("Plans are created under your connected wallet (the creator).");

  const createPlans = await confirm("Create subscription plans now?");
  if (createPlans) {
    let tierIndex = 0;
    let addingPlans = true;

    // Check existing tiers
    const existingCount = await contract.getCreatorTiersCount(deployer.address);
    if (existingCount > 0n) {
      info(`You already have ${existingCount} tier(s) configured.`);
      tierIndex = Number(existingCount);
    }

    while (addingPlans && tierIndex < 10) {
      separator(`Plan ${tierIndex + 1} of up to 10`);

      const metadata = await askWithDefault(
        "Plan name (e.g. 'Basic Monthly', 'Pro Annual'):",
        `Plan ${tierIndex + 1}`
      );

      const benefits = await askWithDefault(
        "Benefits (comma-separated features):",
        "Full content access, Community Discord"
      );

      const durationDays = await askWithDefault(
        "Duration in days (1-365):",
        "30"
      );
      const duration = daysToSeconds(parseInt(durationDays));

      if (duration < 86400 || duration > 31536000) {
        warn("Duration must be 1-365 days. Skipping this plan.");
        continue;
      }

      const ethFeeInput = await askWithDefault(
        "ETH fee (e.g. 0.01). Enter 0 for free or ETH-disabled:",
        "0.01"
      );
      const ethFee = ethers.parseEther(ethFeeInput);

      const tokenFeeInput = await askWithDefault(
        "Token fee in token units (e.g. 20 for 20 USDC). Enter 0 to disable:",
        "20"
      );

      // Detect decimals: default 6 for USDC-like, ask for custom
      let tokenFeeDecimals = 6;
      if (tokenFeeInput !== "0") {
        const decimalsInput = await askWithDefault(
          "Token decimals (6 for USDC/USDT, 18 for WETH/DAI):",
          "6"
        );
        tokenFeeDecimals = parseInt(decimalsInput);
      }
      const tokenFee = ethers.parseUnits(tokenFeeInput, tokenFeeDecimals);

      const activeInput = await askWithDefault(
        "Make this plan active immediately? (yes/no):",
        "yes"
      );
      const active = activeInput.toLowerCase().startsWith("y");

      // Summary
      console.log("\n  📋 Plan Summary:");
      console.log(`     Name:     ${metadata}`);
      console.log(`     Benefits: ${benefits}`);
      console.log(`     Duration: ${durationDays} days`);
      console.log(`     ETH fee:  ${ethFeeInput} ETH`);
      console.log(`     Token fee: ${tokenFeeInput} (${tokenFeeDecimals} decimals)`);
      console.log(`     Active:   ${active ? "Yes" : "No"}`);

      const confirmCreate = await confirm("Create this plan?");
      if (confirmCreate) {
        const tx = await contract.updateCreatorPlan(
          tierIndex,
          ethFee,
          tokenFee,
          duration,
          metadata,
          benefits,
          active
        );
        await tx.wait();
        success(`Plan "${metadata}" created at tier index ${tierIndex}`);

        deploymentData.plans.push({
          tierIndex,
          metadata,
          benefits,
          durationDays: parseInt(durationDays),
          ethFee: ethFeeInput,
          tokenFee: tokenFeeInput,
          active,
        });

        tierIndex++;
      } else {
        info("Plan skipped.");
      }

      if (tierIndex < 10) {
        addingPlans = await confirm("Add another plan?");
      } else {
        info("Maximum 10 plans reached.");
        addingPlans = false;
      }
    }
  }

  // ── Step 6: Summary & Save ────────────────────────────────
  separator("Configuration Complete");

  success("Your SubscriptionPlatform is configured and ready.");
  console.log();
  console.log(`  Contract:  ${contractAddress}`);
  console.log(`  Network:   ${network.name}`);
  console.log(`  Plans:     ${deploymentData.plans.length} created`);
  console.log(`  Tokens:    ${deploymentData.whitelistedTokens.length} added`);

  // Save deployment record
  const savedFile = saveDeploymentRecord(deploymentData);
  success(`Configuration saved to: ${savedFile}`);

  // Print integration snippet
  separator("Your Integration Snippet");
  console.log("  Copy this into your frontend or backend:\n");
  console.log(`  const CONTRACT_ADDRESS = "${contractAddress}";`);
  console.log(`  const CREATOR_ADDRESS  = "${deployer.address}";`);
  console.log(`  // Network: ${network.name} (chainId: ${network.chainId})`);

  if (deploymentData.plans.length > 0) {
    console.log("\n  // Available tiers:");
    deploymentData.plans.forEach((p) => {
      console.log(
        `  //   Tier ${p.tierIndex}: "${p.metadata}" — ${p.ethFee} ETH / ${p.durationDays} days`
      );
    });
  }

  console.log("\n  // Check subscription in your backend:");
  console.log(
    '  // const active = await contract.isSubscriptionActive(CREATOR_ADDRESS, userWallet);'
  );

  separator("Next Steps");
  console.log("  1. Verify your contract on Etherscan:");
  console.log(
    `     npx hardhat verify --network ${network.name} ${contractAddress} "TOKEN_ADDRESS"\n`
  );
  console.log("  2. Test a subscription on your frontend");
  console.log("  3. Set up monitoring (Tenderly recommended)");
  console.log("  4. See docs/QUICK_START.md for frontend integration code\n");

  rl.close();
}

main().catch((err) => {
  console.error("\n❌ Configuration failed:", err.message);
  rl.close();
  process.exit(1);
});
