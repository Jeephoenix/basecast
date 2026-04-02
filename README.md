# BaseCast — Provably Fair On-Chain Casino

**Live at [basecast.org](https://www.basecast.org/) · Pyth Entropy v2 · CoinFlip + Dice + Bingo · Base Network**

> Open-source, provably fair on-chain casino. No KYC. No house keys. 100% on-chain randomness via Pyth Entropy.

---

## Repository

[https://github.com/Jeephoenix/basecast](https://github.com/Jeephoenix/basecast)

---

## Project Structure

```
basecast/
├── contracts/
│   ├── BaseGame.sol      ← Abstract: Pyth Entropy v2 scaffold (all games inherit)
│   ├── GameVault.sol     ← USDC treasury + leaderboard tracking
│   ├── CoinFlip.sol      ← Heads/Tails — 1.94× (3% edge)
│   ├── DiceRoll.sol      ← Range (1.94×) or Exact (5.82×) — 3% edge
│   ├── Bingo.sol         ← Turbo / Speed / Pattern bingo — up to 20× (3% edge)
│   └── MockUSDC.sol      ← Local testing only
├── scripts/
│   └── deploy.js         ← Deploy all contracts in one command
├── app/
│   ├── layout.js         ← Next.js root layout + wagmi providers
│   └── page.jsx          ← Full frontend SPA
├── lib/
│   └── wagmi.js          ← wagmi + RainbowKit config
├── public/               ← logo.png, favicon.ico, og-image.png
├── hardhat.config.js
├── next.config.js
├── package.json
└── .env.example
```

---

## How Pyth Entropy v2 Works

No subscriptions. No LINK. Pay per request.

1. Player calls `placeBet(wager, choice, userRandom)` + sends ETH for fee (~$0.01)
2. Contract calls `entropy.requestWithCallback{value: fee}(provider, userRandom)`
3. Pyth fulfills randomness and calls back `entropyCallback(seqNum, provider, randomNumber)`
4. Game resolves, vault pays winner

---

## Pyth Entropy Addresses

| Network      | Entropy                                    | Provider                                   |
|--------------|--------------------------------------------|--------------------------------------------|
| Base Sepolia | 0x41c9e39574F40Ad34c79f1C99B66A45eFB830d4C | 0x39CC977C83a9b0AEf1C0f4e5a85c8CdA7fB2a9C |
| Base Mainnet | 0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DA  | 0x52DeaA1c84233F7bb8C8A45baeDE41091c616506 |

---

## Deploy to Base Sepolia

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Fill: PRIVATE_KEY, BASE_SEPOLIA_RPC

# 3. Compile
npm run compile

# 4. Deploy
npm run deploy:test
```

Copy output addresses into your `.env`.

### Post-deploy (required)

**Fund vault with USDC:**
```
In Remix → GameVault → approve USDC → depositHouseFunds(amount)
```

**Fund game contracts with ETH (for Pyth fees):**
```
Send 0.05 ETH to CoinFlip address
Send 0.05 ETH to DiceRoll address
Send 0.05 ETH to Bingo address
```

---

## Deploy to Mainnet

```bash
npm run deploy:main
```

Update env vars:
- `NEXT_PUBLIC_CHAIN_ID=8453`
- `NEXT_PUBLIC_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Pyth Mainnet addresses (see table above)

---

## Deploying to Vercel

1. Push to [GitHub](https://github.com/Jeephoenix/basecast)
2. Import the repo on [Vercel](https://vercel.com)
3. Add all `NEXT_PUBLIC_*` env vars in the Vercel dashboard
4. Deploy — Vercel auto-detects Next.js, no extra config needed

The live site is at [https://www.basecast.org/](https://www.basecast.org/).

---

## Running Locally

```bash
npm install
cp .env.example .env
# Fill in your values
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud project ID |
| `NEXT_PUBLIC_VAULT_ADDRESS` | Deployed Vault contract address |
| `NEXT_PUBLIC_COINFLIP_ADDRESS` | Deployed CoinFlip contract address |
| `NEXT_PUBLIC_DICEROLL_ADDRESS` | Deployed DiceRoll contract address |
| `NEXT_PUBLIC_BINGO_ADDRESS` | Deployed Bingo contract address |
| `NEXT_PUBLIC_REFERRAL_ADDRESS` | Deployed Referral contract address |
| `NEXT_PUBLIC_USDC_ADDRESS` | USDC token address |
| `NEXT_PUBLIC_CHAIN_ID` | Chain ID (84532 = Base Sepolia, 8453 = Base Mainnet) |
| `NEXT_PUBLIC_ENTROPY_ADDRESS` | Pyth Entropy contract address |

---

## Adding New Games

```solidity
import "./BaseGame.sol";

contract MyGame is BaseGame {
    constructor(address _vault, address _entropy, address _provider)
        BaseGame(_vault, _entropy, _provider) {}

    function placeBet(uint256 wager, bytes32 userRandom) external payable {
        vault.receiveBet(msg.sender, wager);
        uint64 seq = _requestEntropy(userRandom);
        _pendingPlayer[seq] = msg.sender;
        // store bet data...
    }

    function _resolveGame(uint64 seq, bytes32 random) internal override {
        // resolve with random, call vault.settleBet(player, wager, payout)
    }
}
```

Then: deploy → `vault.setGameAuthorized(newGame, true)` → fund with ETH.

---

## Odds Reference

| Game                     | Win %  | Payout | Edge |
|--------------------------|--------|--------|------|
| Coin Flip                | 48.5%  | 1.94×  | 3%   |
| Dice Range               | 48.5%  | 1.94×  | 3%   |
| Dice Exact               | 16.17% | 5.82×  | 3%   |
| Bingo Turbo — any line   | —      | 2.9×   | 3%   |
| Bingo Turbo — full card  | —      | 8×     | 3%   |
| Bingo Speed — first line | —      | 2.4×   | 3%   |
| Bingo Speed — full card  | —      | 18×    | 3%   |
| Bingo Pattern — blackout | —      | 20×    | 3%   |

---

## License

MIT — open source and free to fork.
