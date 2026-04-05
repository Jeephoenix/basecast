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

    // 4. Bingo
  console.log("🎯 Deploying Bingo...");
  const bingo = await (await ethers.getContractFactory("Bingo")).deploy(vaultAddr, cfg.entropy);
  await bingo.waitForDeployment();
  const bingoAddr = await bingo.getAddress();
  console.log(`   → ${bingoAddr}`);
  if (net !== "hardhat") await bingo.deploymentTransaction().wait(3);

  // 4b. BingoMultiplayer
  console.log("🎱 Deploying BingoMultiplayer...");
  const bingoMP = await (await ethers.getContractFactory("BingoMultiplayer")).deploy(usdcAddr, vaultAddr, cfg.entropy);
  await bingoMP.waitForDeployment();
  const bingoMPAddr = await bingoMP.getAddress();
  console.log(`   → ${bingoMPAddr}`);
  if (net !== "hardhat") await bingoMP.deploymentTransaction().wait(3);

  // 5. ReferralRewards
  console.log("🎁 Deploying ReferralRewards...");
  const referral = await (await ethers.getContractFactory("ReferralRewards")).deploy(usdcAddr, vaultAddr);
  await referral.waitForDeployment();
  const referralAddr = await referral.getAddress();
  console.log(`   → ${referralAddr}`);
  if (net !== "hardhat") await referral.deploymentTransaction().wait(3);

  // 6. Authorize games + wire referral contract
  console.log("\n🔐 Authorizing games...");
  await (await vault.setGameAuthorized(coinflipAddr, true)).wait();
  await (await vault.setGameAuthorized(dicerollAddr, true)).wait();
  await (await vault.setGameAuthorized(bingoAddr, true)).wait();
  await (await vault.setGameAuthorized(bingoMPAddr, true)).wait();
  console.log("   CoinFlip ✓  DiceRoll ✓  Bingo ✓  BingoMultiplayer ✓");

  console.log("\n🔗 Linking ReferralRewards to GameVault...");
  await (await vault.setReferralContract(referralAddr)).wait();
  console.log("   ReferralRewards ✓");

  // Summary
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║        Deployment Complete 🚀        ║");
  console.log("╚══════════════════════════════════════╝\n");
  console.log("  Paste into your .env / Vercel env vars:\n");
  console.log(`  NEXT_PUBLIC_VAULT_ADDRESS=${vaultAddr}`);
  console.log(`  NEXT_PUBLIC_COINFLIP_ADDRESS=${coinflipAddr}`);
  console.log(`  NEXT_PUBLIC_DICEROLL_ADDRESS=${dicerollAddr}`);
  console.log(`  NEXT_PUBLIC_BINGO_ADDRESS=${bingoAddr}`);
  console.log(`  NEXT_PUBLIC_BINGO_MULTIPLAYER_ADDRESS=${bingoMPAddr}`);
  console.log(`  NEXT_PUBLIC_REFERRAL_ADDRESS=${referralAddr}`);
  console.log(`  NEXT_PUBLIC_USDC_ADDRESS=${usdcAddr}`);
  console.log(`  NEXT_PUBLIC_CHAIN_ID=${cfg.chainId}`);
  console.log(`  NEXT_PUBLIC_ENTROPY_ADDRESS=${cfg.entropy}`);
  console.log(`  NEXT_PUBLIC_ENTROPY_PROVIDER=${cfg.provider}`);
  console.log("\n  ⚠️  Post-deploy:");
  console.log("  1. Approve USDC + call vault.depositHouseFunds(amount)");
  console.log("  2. Approve USDC + call referral.depositRewards(amount) to seed the rewards pool");
  console.log("  3. Send 0.05 ETH to CoinFlip, DiceRoll, Bingo, and BingoMultiplayer (for Pyth fees)");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
