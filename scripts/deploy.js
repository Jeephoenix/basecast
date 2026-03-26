// scripts/deploy.js
// ─────────────────────────────────────────────────────────────────────────────
// BaseCast Deployment Script
// Deploys: GameVault → CoinFlip → DiceRoll
// Then:    Authorizes both game contracts on the vault
// Usage:
//   Testnet:  npx hardhat run scripts/deploy.js --network baseSepolia
//   Mainnet:  npx hardhat run scripts/deploy.js --network base
// ─────────────────────────────────────────────────────────────────────────────

const { ethers, network, run } = require("hardhat");
require("dotenv").config();

// ── Config ───────────────────────────────────────────────────────────────────
const CONFIG = {
  base: {
    usdc:           "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    vrfSubId:        process.env.VRF_SUBSCRIPTION_ID,
    houseFundAmount: ethers.parseUnits("100", 6), // $100 USDC initial bankroll
  },
  baseSepolia: {
    usdc:           "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    vrfSubId:        process.env.VRF_SUBSCRIPTION_ID,
    houseFundAmount: ethers.parseUnits("10", 6),  // $10 USDC for testnet
  },
  hardhat: {
    usdc:           null,  // will deploy mock
    vrfSubId:        "1",
    houseFundAmount: ethers.parseUnits("1000", 6),
  },
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = network.name;
  const cfg = CONFIG[net];

  if (!cfg) throw new Error(`Unknown network: ${net}`);

  console.log("\n╔════════════════════════════════════════╗");
  console.log("║       BaseCast Deployment Script       ║");
  console.log("╚════════════════════════════════════════╝\n");
  console.log(`  Network  : ${net}`);
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  Balance  : ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`);

  // ── Step 1: USDC (mock for local only) ─────────────────────────────────────
  let usdcAddress = cfg.usdc;
  if (net === "hardhat") {
    console.log("📦 Deploying MockUSDC for local testing...");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUsdc = await MockUSDC.deploy();
    await mockUsdc.waitForDeployment();
    usdcAddress = await mockUsdc.getAddress();
    console.log(`   MockUSDC deployed → ${usdcAddress}`);

    // Mint to deployer for testing
    await mockUsdc.mint(deployer.address, ethers.parseUnits("10000", 6));
    console.log("   Minted 10,000 USDC to deployer\n");
  }

  // ── Step 2: GameVault ───────────────────────────────────────────────────────
  console.log("🏦 Deploying GameVault...");
  const GameVault = await ethers.getContractFactory("GameVault");
  const vault = await GameVault.deploy(usdcAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`   GameVault deployed → ${vaultAddress}`);

  // Wait a few blocks for Basescan indexing
  if (net !== "hardhat") {
    console.log("   Waiting 5 blocks for explorer indexing...");
    await vault.deploymentTransaction().wait(5);
  }

  // ── Step 3: CoinFlip ────────────────────────────────────────────────────────
  console.log("\n🪙 Deploying CoinFlip...");
  const CoinFlip = await ethers.getContractFactory("CoinFlip");
  const coinflip = await CoinFlip.deploy(vaultAddress, cfg.vrfSubId);
  await coinflip.waitForDeployment();
  const coinflipAddress = await coinflip.getAddress();
  console.log(`   CoinFlip deployed  → ${coinflipAddress}`);

  if (net !== "hardhat") {
    await coinflip.deploymentTransaction().wait(5);
  }

  // ── Step 4: DiceRoll ────────────────────────────────────────────────────────
  console.log("\n🎲 Deploying DiceRoll...");
  const DiceRoll = await ethers.getContractFactory("DiceRoll");
  const diceroll = await DiceRoll.deploy(vaultAddress, cfg.vrfSubId);
  await diceroll.waitForDeployment();
  const dicerollAddress = await diceroll.getAddress();
  console.log(`   DiceRoll deployed  → ${dicerollAddress}`);

  if (net !== "hardhat") {
    await diceroll.deploymentTransaction().wait(5);
  }

  // ── Step 5: Authorize game contracts on vault ───────────────────────────────
  console.log("\n🔐 Authorizing game contracts on GameVault...");
  const authCoinFlip = await vault.setGameAuthorized(coinflipAddress, true);
  await authCoinFlip.wait();
  console.log(`   CoinFlip authorized ✓`);

  const authDiceRoll = await vault.setGameAuthorized(dicerollAddress, true);
  await authDiceRoll.wait();
  console.log(`   DiceRoll authorized ✓`);

  // ── Step 6: Verify on Basescan ──────────────────────────────────────────────
  if (net !== "hardhat") {
    console.log("\n🔍 Verifying contracts on Basescan...");

    try {
      await run("verify:verify", {
        address: vaultAddress,
        constructorArguments: [usdcAddress],
      });
      console.log("   GameVault verified ✓");
    } catch (e) {
      console.log(`   GameVault verify failed: ${e.message}`);
    }

    try {
      await run("verify:verify", {
        address: coinflipAddress,
        constructorArguments: [vaultAddress, cfg.vrfSubId],
      });
      console.log("   CoinFlip verified ✓");
    } catch (e) {
      console.log(`   CoinFlip verify failed: ${e.message}`);
    }

    try {
      await run("verify:verify", {
        address: dicerollAddress,
        constructorArguments: [vaultAddress, cfg.vrfSubId],
      });
      console.log("   DiceRoll verified ✓");
    } catch (e) {
      console.log(`   DiceRoll verify failed: ${e.message}`);
    }
  }

  // ── Step 7: Print deployment summary ───────────────────────────────────────
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║         Deployment Complete! 🚀        ║");
  console.log("╚════════════════════════════════════════╝\n");
  console.log("  Copy these into your .env file:\n");
  console.log(`  NEXT_PUBLIC_GAME_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`  NEXT_PUBLIC_COINFLIP_ADDRESS=${coinflipAddress}`);
  console.log(`  NEXT_PUBLIC_DICEROLL_ADDRESS=${dicerollAddress}`);
  console.log(`  NEXT_PUBLIC_USDC_ADDRESS=${usdcAddress}`);
  console.log(`  NEXT_PUBLIC_CHAIN_ID=${net === "base" ? 8453 : 84532}\n`);

  // ── Step 8: IMPORTANT post-deploy instructions ──────────────────────────────
  console.log("  ⚠️  IMPORTANT — Manual steps required:\n");
  console.log("  1. Go to https://vrf.chain.link");
  console.log(`     Add consumer: ${coinflipAddress}`);
  console.log(`     Add consumer: ${dicerollAddress}`);
  console.log("     (Both must be added to your VRF subscription)\n");
  console.log("  2. Fund the vault with USDC for the house bankroll:");
  console.log(`     vault.depositHouseFunds(amount) on ${vaultAddress}\n`);
  console.log("  3. Approve USDC spend for vault before any bets can be placed\n");

  return {
    vault:    vaultAddress,
    coinflip: coinflipAddress,
    diceroll: dicerollAddress,
    usdc:     usdcAddress,
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });
