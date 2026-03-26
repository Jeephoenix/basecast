# BaseCast 🎲
**Provably Fair On-Chain Casino on Base**

---

## Project Structure

```
basecast/
├── contracts/
│   ├── GameVault.sol      # House treasury — holds USDC bankroll
│   ├── CoinFlip.sol       # Heads/Tails game (1.94x payout, 3% edge)
│   └── DiceRoll.sol       # Dice game (1.94x range / 5.82x exact, 3% edge)
├── scripts/
│   └── deploy.js          # Deployment script (testnet + mainnet)
├── hooks/
│   └── useBaseCast.js     # wagmi hooks for frontend
├── lib/
│   └── wagmi.js           # wagmi + RainbowKit provider setup
├── hardhat.config.js
├── package.json
└── .env.example
```

---

## Quick Start

### 1. Install dependencies

```bash
# In Termux or your dev environment
npm install
```

### 2. Set up environment

```bash
cp .env.example .env
# Edit .env and fill in:
# - PRIVATE_KEY
# - BASESCAN_API_KEY
# - VRF_SUBSCRIPTION_ID
```

### 3. Get a Chainlink VRF Subscription

1. Go to https://vrf.chain.link
2. Select **Base** network
3. Click **Create Subscription**
4. Fund it with LINK tokens (get from https://faucets.chain.link)
5. Copy the **Subscription ID** → paste into `.env`

### 4. Compile contracts

```bash
npm run compile
```

### 5. Deploy to Base Sepolia (testnet first!)

```bash
npm run deploy:test
```

Copy the output addresses into your `.env` file.

### 6. Add VRF consumers

After deployment, go back to https://vrf.chain.link and:
- Add **CoinFlip contract address** as a consumer
- Add **DiceRoll contract address** as a consumer

⚠️ This step is required — without it, VRF callbacks will fail.

### 7. Fund the vault

```bash
# Using Hardhat console or Basescan's Write Contract:
# 1. Approve USDC spend to vault address
# 2. Call vault.depositHouseFunds(amount)
# Recommended: start with $100–$500 USDC on testnet
```

### 8. Run the frontend

```bash
npm run dev
# Opens at http://localhost:3000
```

---

## Deploy to Mainnet

Once testnet works end-to-end:

```bash
npm run deploy:main
```

Same post-deploy steps apply (add VRF consumers, fund vault).

---

## Using the wagmi Hooks

```jsx
import { useCoinFlip, useDiceRoll, useVaultStats, useUsdcBalance } from "@/hooks/useBaseCast";

function CoinFlipGame() {
  const { placeBet, state, result, error, reset, isPending } = useCoinFlip();
  const { balance } = useUsdcBalance();
  const { maxBet, vaultBalance } = useVaultStats();

  const handleBet = async () => {
    await placeBet(10, "HEADS"); // $10 USDC on Heads
  };

  if (state === "pending_vrf") return <div>Waiting for Chainlink VRF...</div>;
  if (state === "settled") return (
    <div>
      {result.won
        ? `You won $${result.payout}!`
        : `You lost $${result.wager}`}
      <button onClick={reset}>Play Again</button>
    </div>
  );

  return (
    <div>
      <p>Balance: ${balance} USDC</p>
      <p>Max Bet: ${maxBet} USDC</p>
      <button onClick={handleBet} disabled={isPending}>
        Flip $10 on HEADS
      </button>
    </div>
  );
}
```

---

## Adding New Games (Future)

1. Deploy your new game contract (e.g. `Crash.sol`)
2. Call `vault.setGameAuthorized(newGameAddress, true)`
3. Done — GameVault never changes

---

## House Edge Reference

| Game          | Win Chance | Payout | Edge |
|---------------|-----------|--------|------|
| Coin Flip     | 48.5%     | 1.94×  | 3%   |
| Dice Range    | 48.5%     | 1.94×  | 3%   |
| Dice Exact    | 16.17%    | 5.82×  | 3%   |

---

## Revenue Estimate

At $25,000 daily volume with 2.1% blended edge:
- Daily revenue: **~$525**
- Monthly revenue: **~$15,750**
- Scales linearly with volume — no extra work

---

## Security Checklist Before Mainnet

- [ ] Contracts compiled with `evmVersion: "paris"`
- [ ] All contracts verified on Basescan
- [ ] VRF consumers added for both game contracts
- [ ] Emergency pause tested on testnet
- [ ] Max bet set conservatively (1% of vault)
- [ ] Stuck bet refund tested (1 hour timeout)
- [ ] Consider a Code4rena audit for mainnet launch
