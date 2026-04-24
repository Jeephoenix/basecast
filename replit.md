# BaseCast

Next.js 14 (App Router, JavaScript) on-chain casino dApp using wagmi/RainbowKit, Pyth Entropy, and a Postgres backend.

## Run on Replit

- Workflow `Start application` runs `npm run dev` (Next dev server on port 5000, host 0.0.0.0).
- Build: `npm run build` — Start (prod): `npm run start`.

## Replit migration notes

- Dev/start scripts already bind `-p 5000 -H 0.0.0.0` (Replit-friendly).
- `next.config.js` omits `X-Frame-Options` so the Replit preview iframe works; SWC minifier disabled (Babel-compatible build).
- Initial install of `@next/swc-linux-x64-gnu` produced a corrupt native binary causing a `Bus error` at startup. Fix: `rm -rf node_modules/@next/swc-linux-x64-gnu && npm install @next/swc-linux-x64-gnu`. If the error returns after a reinstall, repeat that step.

## Environment variables

See `.env.example`. Set as Replit Secrets when needed:
- Web3: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_CHAIN_ID`, contract addresses, RPC URLs.
- Backend: `DATABASE_URL` (Postgres), `RESEND_API_KEY`, `FEEDBACK_EMAIL`.
- Hardhat (only for contract deploys): `PRIVATE_KEY`, `BASE_SEPOLIA_RPC`, `BASE_MAINNET_RPC`.

The app starts without these and uses safe defaults (public Base RPCs, demo WalletConnect ID); features that need a real key (DB writes, email, contract calls) will fail until the relevant secret is set.

## UI audit (April 2026)

All 18 audit items applied. Highlights:
- Design tokens + extracted `app/globals.css`; sonner toasts via `lib/notify.js`; Inter via `next/font/google`.
- `<Address/>` (with Basename + ENS resolution via `lib/useBasename.js`) replaces every `getLbName` / `shortAddr` call site in leaderboard (home top-3, full list, podium), live ticker, profile, and tx history.
- Skeleton loaders (`components/Skeleton.jsx`) wired into leaderboard (home + full) and transaction history during fetch.
- `QuickBtns` ½/2×/Max + `PayInfo` (payout / win-chance / multiplier) on Coin Flip & Dice.
- `AutoBetPanel`: configurable rounds + stop-on-profit / stop-on-loss for Coin Flip and Dice. Chains rounds via `useEffect` on `cfRes.settledAt` / `dRes.settledAt`; manual play disabled while running; live counter + session PnL + Stop button.
- Onboarding: tertiary "Skip intro" link on step 0, secondary "Back" otherwise, primary "Next/Connect Wallet"; Escape to close; landing rendered behind translucent backdrop.
- Modals (Onboarding, PolicyModal) close on Escape; LiveBetTicker rows are clickable BaseScan links with won/lost hover tint.
- Verify-on-Pyth links on every result card; Space-to-repeat-last-bet hotkey; haptic feedback on place/win.
- Metadata: `app/opengraph-image.js` (dynamic OG), `app/icon.js`, `viewport` export (themeColor moved out of metadata to silence Next 14 warnings).
- BingoGame is `next/dynamic` (lazy-loaded).

Deferred: full route-splitting of `app/page.jsx`, RainbowKit→OnchainKit migration.
