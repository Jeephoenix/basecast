/**
 * /api/btc-keeper
 *
 * Next.js API route acting as the keeper for the BTCPredict contract.
 * Called by the frontend when a round timer expires, or can be hit by
 * any external scheduler.
 *
 * Required env vars:
 *   KEEPER_PRIVATE_KEY          — operator wallet private key (0x...)
 *   NEXT_PUBLIC_BTCPREDICT_ADDRESS — deployed contract address
 *   NEXT_PUBLIC_BASE_SEPOLIA_RPC / NEXT_PUBLIC_BASE_RPC — RPC endpoint
 *   NEXT_PUBLIC_CHAIN_ID        — 84532 (testnet) or 8453 (mainnet)
 */

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

const BTCPREDICT_ABI = [
  { name: "currentEpoch",     type: "function", stateMutability: "view",        inputs: [],                                  outputs: [{ type: "uint256" }] },
  { name: "genesisStartOnce", type: "function", stateMutability: "view",        inputs: [],                                  outputs: [{ type: "bool"    }] },
  { name: "genesisLockOnce",  type: "function", stateMutability: "view",        inputs: [],                                  outputs: [{ type: "bool"    }] },
  { name: "paused",           type: "function", stateMutability: "view",        inputs: [],                                  outputs: [{ type: "bool"    }] },
  { name: "getRound",         type: "function", stateMutability: "view",        inputs: [{ name: "epoch", type: "uint256" }], outputs: [{ type: "tuple",  components: [
    { name: "epoch",          type: "uint256" },
    { name: "startTimestamp", type: "uint256" },
    { name: "lockTimestamp",  type: "uint256" },
    { name: "closeTimestamp", type: "uint256" },
    { name: "lockPrice",      type: "int64"   },
    { name: "closePrice",     type: "int64"   },
    { name: "totalAmount",    type: "uint256" },
    { name: "upAmount",       type: "uint256" },
    { name: "downAmount",     type: "uint256" },
    { name: "treasuryAmount", type: "uint256" },
    { name: "status",         type: "uint8"   },
  ]}] },
  { name: "genesisStartRound", type: "function", stateMutability: "nonpayable", inputs: [],                                                  outputs: [] },
  { name: "genesisLockRound",  type: "function", stateMutability: "payable",    inputs: [{ name: "updateData", type: "bytes[]" }],           outputs: [] },
  { name: "executeRound",      type: "function", stateMutability: "payable",    inputs: [{ name: "updateData", type: "bytes[]" }],           outputs: [] },
];

const BTC_PRICE_ID = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac3f3438fe94f7f04e90b33f2c6";

const STATUS = { Pending: 0, Open: 1, Locked: 2, Ended: 3, Cancelled: 4 };

async function getPythUpdateData() {
  try {
    const res = await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${BTC_PRICE_ID}`,
      { headers: { Accept: "application/json" }, next: { revalidate: 0 } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const hex = json?.binary?.data?.[0];
    if (!hex) return [];
    return [`0x${hex}`];
  } catch {
    return [];
  }
}

export async function GET() {
  const pk          = process.env.KEEPER_PRIVATE_KEY;
  const contractAddr = process.env.NEXT_PUBLIC_BTCPREDICT_ADDRESS;
  const chainId     = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "84532");
  const rpc         = chainId === 8453
    ? (process.env.NEXT_PUBLIC_BASE_RPC        || "https://mainnet.base.org")
    : (process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || "https://sepolia.base.org");

  if (!pk)           return Response.json({ ok: false, error: "KEEPER_PRIVATE_KEY not set" },           { status: 500 });
  if (!contractAddr) return Response.json({ ok: false, error: "NEXT_PUBLIC_BTCPREDICT_ADDRESS not set" }, { status: 500 });

  const chain   = chainId === 8453 ? base : baseSepolia;
  const account = privateKeyToAccount(pk.startsWith("0x") ? pk : `0x${pk}`);

  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const walletClient = createWalletClient({ chain, account, transport: http(rpc) });

  try {
    const [genesisStart, genesisLock, currentEpoch, paused] = await Promise.all([
      publicClient.readContract({ address: contractAddr, abi: BTCPREDICT_ABI, functionName: "genesisStartOnce" }),
      publicClient.readContract({ address: contractAddr, abi: BTCPREDICT_ABI, functionName: "genesisLockOnce"  }),
      publicClient.readContract({ address: contractAddr, abi: BTCPREDICT_ABI, functionName: "currentEpoch"     }),
      publicClient.readContract({ address: contractAddr, abi: BTCPREDICT_ABI, functionName: "paused"           }),
    ]);

    if (paused) return Response.json({ ok: false, error: "Contract is paused" });

    const now = BigInt(Math.floor(Date.now() / 1000));

    // ── Step 1: Genesis start ────────────────────────────────────────────
    if (!genesisStart) {
      const hash = await walletClient.writeContract({
        address: contractAddr, abi: BTCPREDICT_ABI, functionName: "genesisStartRound",
      });
      return Response.json({ ok: true, action: "genesisStartRound", hash });
    }

    // ── Step 2: Genesis lock ─────────────────────────────────────────────
    if (!genesisLock) {
      const round = await publicClient.readContract({
        address: contractAddr, abi: BTCPREDICT_ABI, functionName: "getRound", args: [currentEpoch],
      });
      if (round.lockTimestamp > now) {
        const wait = Number(round.lockTimestamp - now);
        return Response.json({ ok: false, error: `Too early for genesis lock. Wait ${wait}s.` });
      }
      const updateData = await getPythUpdateData();
      const hash = await walletClient.writeContract({
        address: contractAddr, abi: BTCPREDICT_ABI, functionName: "genesisLockRound",
        args: [updateData], value: 1n,
      });
      return Response.json({ ok: true, action: "genesisLockRound", hash });
    }

    // ── Step 3: Regular executeRound ─────────────────────────────────────
    const round = await publicClient.readContract({
      address: contractAddr, abi: BTCPREDICT_ABI, functionName: "getRound", args: [currentEpoch],
    });

    if (round.lockTimestamp > now) {
      const wait = Number(round.lockTimestamp - now);
      return Response.json({ ok: false, error: `Too early. Wait ${wait}s.` });
    }

    const updateData = await getPythUpdateData();
    const hash = await walletClient.writeContract({
      address: contractAddr, abi: BTCPREDICT_ABI, functionName: "executeRound",
      args: [updateData], value: 1n,
    });

    return Response.json({ ok: true, action: "executeRound", epoch: currentEpoch.toString(), hash });
  } catch (err) {
    const msg = err?.shortMessage || err?.message || "Unknown error";
    if (msg.includes("Too early")) {
      return Response.json({ ok: false, error: msg });
    }
    console.error("[btc-keeper]", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
