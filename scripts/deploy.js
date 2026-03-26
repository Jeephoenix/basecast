// scripts/deploy.js
const { ethers, network } = require("hardhat");
require("dotenv").config();

const CONFIG = {
  baseSepolia: {
    usdc:     "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    entropy:  "0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4C",
    provider: "0x39CC977C83a9b0AEf1C0f4e5a85c8CdA7fB2a9C",
    chainId:  84532,
  },
  base: {
    usdc:     "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    entropy:  "0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DA",
    provider: "0x52DeaA1c84233F7bb8C8A45baeDE41091c616506",
    chainId:  8453,
  },
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = network.name;
  const cfg = CONFIG[net] || CONFIG.baseSepolia;

  console.log("\n╔══════════════════════════════════════╗");
  console.log("║    BaseCast — Pyth Entropy v2 Deploy ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`\n  Network  : ${net}`);
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  Balance  : ${ethers.formatEther(await deployer.provider.getBalance(deployer.address))} ETH\n`);

  let usdcAddr = cfg.usdc;

  // Local mock
  if (net === "hardhat") {
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mock = await MockUSDC.deploy();
    await mock.waitForDeployment();
    usdcAddr = await mock.getAddress();
    await mock.mint(deployer.address, ethers.parseUnits("10000", 6));
    console.log(`  MockUSDC → ${usdcAddr}`);
  }

  // 1. GameVault
  console.log("\n🏦 Deploying GameVault...");
  const vault = await (await ethers.getContractFactory("GameVault")).deploy(usdcAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`   → ${vaultAddr}`);
  if (net !== "hardhat") await vault.deploymentTransaction().wait(3);

  // 2. CoinFlip
  console.log("🪙 Deploying CoinFlip...");
  const coinflip = await (await ethers.getContractFactory("CoinFlip")).deploy(vaultAddr, cfg.entropy, cfg.provider);
  await coinflip.waitForDeployment();
  const coinflipAddr = await coinflip.getAddress();
  console.log(`   → ${coinflipAddr}`);
  if (net !== "hardhat") await coinflip.deploymentTransaction().wait(3);

  // 3. DiceRoll
  console.log("🎲 Deploying DiceRoll...");
  const diceroll = await (await ethers.getContractFactory("DiceRoll")).deploy(vaultAddr, cfg.entropy, cfg.provider);
  await diceroll.waitForDeployment();
  const dicerollAddr = await diceroll.getAddress();
  console.log(`   → ${dicerollAddr}`);
  if (net !== "hardhat") await diceroll.deploymentTransaction().wait(3);

  // 4. Authorize
  console.log("\n🔐 Authorizing games...");
  await (await vault.setGameAuthorized(coinflipAddr, true)).wait();
  await (await vault.setGameAuthorized(dicerollAddr, true)).wait();
  console.log("   CoinFlip ✓  DiceRoll ✓");

  // Summary
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║        Deployment Complete 🚀        ║");
  console.log("╚══════════════════════════════════════╝\n");
  console.log("  Paste into your .env / Netlify env vars:\n");
  console.log(`  NEXT_PUBLIC_VAULT_ADDRESS=${vaultAddr}`);
  console.log(`  NEXT_PUBLIC_COINFLIP_ADDRESS=${coinflipAddr}`);
  console.log(`  NEXT_PUBLIC_DICEROLL_ADDRESS=${dicerollAddr}`);
  console.log(`  NEXT_PUBLIC_USDC_ADDRESS=${usdcAddr}`);
  console.log(`  NEXT_PUBLIC_CHAIN_ID=${cfg.chainId}`);
  console.log(`  NEXT_PUBLIC_ENTROPY_ADDRESS=${cfg.entropy}`);
  console.log(`  NEXT_PUBLIC_ENTROPY_PROVIDER=${cfg.provider}`);
  console.log("\n  ⚠️  Post-deploy:");
  console.log("  1. Approve USDC + call vault.depositHouseFunds(amount)");
  console.log("  2. Send 0.05 ETH to CoinFlip + DiceRoll (for Pyth fees)");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
