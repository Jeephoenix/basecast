// hooks/useBaseCast.js
// ─────────────────────────────────────────────────────────────────────────────
// wagmi v2 + viem hooks for BaseCast
// Covers: USDC approve, CoinFlip bets, DiceRoll bets, vault reads
// ─────────────────────────────────────────────────────────────────────────────

import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { useState, useCallback } from "react";

// ── Contract Addresses (from .env) ────────────────────────────────────────────
export const ADDRESSES = {
  vault:    process.env.NEXT_PUBLIC_GAME_VAULT_ADDRESS,
  coinflip: process.env.NEXT_PUBLIC_COINFLIP_ADDRESS,
  diceroll: process.env.NEXT_PUBLIC_DICEROLL_ADDRESS,
  usdc:     process.env.NEXT_PUBLIC_USDC_ADDRESS,
};

// ── ABIs (minimal — only what the frontend needs) ─────────────────────────────

export const USDC_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];

export const VAULT_ABI = [
  {
    name: "vaultBalance",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "maxBet",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "minBet",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "houseProfit",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
];

export const COINFLIP_ABI = [
  {
    name: "placeBet",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wager",  type: "uint256" },
      { name: "choice", type: "uint8" },   // 0 = HEADS, 1 = TAILS
    ],
    outputs: [{ name: "requestId", type: "uint256" }],
  },
  {
    name: "getBet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "player",     type: "address" },
          { name: "wager",      type: "uint256" },
          { name: "choice",     type: "uint8"   },
          { name: "status",     type: "uint8"   }, // 0=PENDING,1=WON,2=LOST,3=REFUNDED
          { name: "payout",     type: "uint256" },
          { name: "timestamp",  type: "uint256" },
          { name: "randomWord", type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getPlayerBets",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "verifyBet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: [
      { name: "result", type: "uint8"  },
      { name: "won",    type: "bool"   },
    ],
  },
  {
    name: "totalBetsPlaced",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalWagered",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Events
  {
    name: "BetPlaced",
    type: "event",
    inputs: [
      { name: "requestId", type: "uint256", indexed: true  },
      { name: "player",    type: "address", indexed: true  },
      { name: "wager",     type: "uint256", indexed: false },
      { name: "choice",    type: "uint8",   indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    name: "BetSettled",
    type: "event",
    inputs: [
      { name: "requestId", type: "uint256", indexed: true  },
      { name: "player",    type: "address", indexed: true  },
      { name: "wager",     type: "uint256", indexed: false },
      { name: "choice",    type: "uint8",   indexed: false },
      { name: "result",    type: "uint8",   indexed: false },
      { name: "won",       type: "bool",    indexed: false },
      { name: "payout",    type: "uint256", indexed: false },
      { name: "randomWord",type: "uint256", indexed: false },
    ],
  },
];

export const DICEROLL_ABI = [
  {
    name: "placeBetExact",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wager",  type: "uint256" },
      { name: "number", type: "uint8"   },
    ],
    outputs: [{ name: "requestId", type: "uint256" }],
  },
  {
    name: "placeBetRange",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "wager", type: "uint256" },
      { name: "high",  type: "bool"    },
    ],
    outputs: [{ name: "requestId", type: "uint256" }],
  },
  {
    name: "getBet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "player",       type: "address" },
          { name: "wager",        type: "uint256" },
          { name: "betType",      type: "uint8"   }, // 0=EXACT,1=RANGE_LOW,2=RANGE_HIGH
          { name: "exactNumber",  type: "uint8"   },
          { name: "status",       type: "uint8"   },
          { name: "payout",       type: "uint256" },
          { name: "timestamp",    type: "uint256" },
          { name: "rolledNumber", type: "uint8"   },
          { name: "randomWord",   type: "uint256" },
        ],
      },
    ],
  },
  {
    name: "getPlayerBets",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "verifyBet",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "requestId", type: "uint256" }],
    outputs: [
      { name: "rolledNumber", type: "uint8" },
      { name: "won",          type: "bool"  },
    ],
  },
  {
    name: "BetSettled",
    type: "event",
    inputs: [
      { name: "requestId",   type: "uint256", indexed: true  },
      { name: "player",      type: "address", indexed: true  },
      { name: "wager",       type: "uint256", indexed: false },
      { name: "betType",     type: "uint8",   indexed: false },
      { name: "exactNumber", type: "uint8",   indexed: false },
      { name: "rolledNumber",type: "uint8",   indexed: false },
      { name: "won",         type: "bool",    indexed: false },
      { name: "payout",      type: "uint256", indexed: false },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HOOK: useUsdcBalance — player's USDC balance + vault allowance
// ─────────────────────────────────────────────────────────────────────────────
export function useUsdcBalance() {
  const { address } = useAccount();

  const { data: rawBalance, refetch: refetchBalance } = useReadContract({
    address: ADDRESSES.usdc,
    abi:     USDC_ABI,
    functionName: "balanceOf",
    args:    [address],
    query:   { enabled: !!address },
  });

  const { data: rawAllowance, refetch: refetchAllowance } = useReadContract({
    address: ADDRESSES.usdc,
    abi:     USDC_ABI,
    functionName: "allowance",
    args:    [address, ADDRESSES.vault],
    query:   { enabled: !!address },
  });

  return {
    balance:          rawBalance   ? formatUnits(rawBalance,   6) : "0",
    allowance:        rawAllowance ? formatUnits(rawAllowance, 6) : "0",
    rawBalance:       rawBalance   ?? 0n,
    rawAllowance:     rawAllowance ?? 0n,
    refetch: () => { refetchBalance(); refetchAllowance(); },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK: useApproveUsdc — approve vault to spend player's USDC
// ─────────────────────────────────────────────────────────────────────────────
export function useApproveUsdc() {
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState(null);

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const approve = useCallback(async (amount) => {
    // Approve a large amount so player doesn't need to re-approve every bet
    // Using max uint256 is common practice for gaming dApps
    const approveAmount = parseUnits(amount.toString(), 6);
    const hash = await writeContractAsync({
      address:      ADDRESSES.usdc,
      abi:          USDC_ABI,
      functionName: "approve",
      args:         [ADDRESSES.vault, approveAmount],
    });
    setTxHash(hash);
    return hash;
  }, [writeContractAsync]);

  return {
    approve,
    isPending:    isPending || isConfirming,
    isSuccess,
    txHash,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK: useVaultStats — live vault balance, max bet, min bet
// ─────────────────────────────────────────────────────────────────────────────
export function useVaultStats() {
  const { data: rawVaultBalance } = useReadContract({
    address:      ADDRESSES.vault,
    abi:          VAULT_ABI,
    functionName: "vaultBalance",
  });

  const { data: rawMaxBet } = useReadContract({
    address:      ADDRESSES.vault,
    abi:          VAULT_ABI,
    functionName: "maxBet",
  });

  const { data: rawMinBet } = useReadContract({
    address:      ADDRESSES.vault,
    abi:          VAULT_ABI,
    functionName: "minBet",
  });

  const { data: rawHouseProfit } = useReadContract({
    address:      ADDRESSES.vault,
    abi:          VAULT_ABI,
    functionName: "houseProfit",
  });

  return {
    vaultBalance: rawVaultBalance ? formatUnits(rawVaultBalance, 6) : "0",
    maxBet:       rawMaxBet       ? formatUnits(rawMaxBet,       6) : "0",
    minBet:       rawMinBet       ? formatUnits(rawMinBet,       6) : "0",
    houseProfit:  rawHouseProfit  ? formatUnits(rawHouseProfit,  6) : "0",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK: useCoinFlip — place bets + listen for VRF settlement
// ─────────────────────────────────────────────────────────────────────────────
export function useCoinFlip() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending } = useWriteContract();

  const [state, setState] = useState("idle"); // idle | approving | placing | pending_vrf | settled
  const [requestId, setRequestId] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const { rawAllowance, refetch: refetchUsdc } = useUsdcBalance();

  const placeBet = useCallback(async (wagerUsd, choice) => {
    try {
      setError(null);
      setResult(null);
      const wager = parseUnits(wagerUsd.toString(), 6);

      // 1. Check allowance — approve if needed
      if (rawAllowance < wager) {
        setState("approving");
        const approveTx = await writeContractAsync({
          address:      ADDRESSES.usdc,
          abi:          USDC_ABI,
          functionName: "approve",
          args:         [ADDRESSES.vault, wager * 1000n], // approve 1000x to avoid re-approvals
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        refetchUsdc();
      }

      // 2. Place the bet (0 = HEADS, 1 = TAILS)
      setState("placing");
      const choiceInt = choice === "HEADS" ? 0 : 1;
      const betTx = await writeContractAsync({
        address:      ADDRESSES.coinflip,
        abi:          COINFLIP_ABI,
        functionName: "placeBet",
        args:         [wager, choiceInt],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: betTx });

      // 3. Extract requestId from BetPlaced event
      const betPlacedLog = receipt.logs.find(log => {
        try {
          // Look for the BetPlaced event signature
          return log.address.toLowerCase() === ADDRESSES.coinflip.toLowerCase();
        } catch { return false; }
      });

      // Parse requestId from log (first topic after event sig = requestId for indexed)
      const reqId = betPlacedLog?.topics?.[1]
        ? BigInt(betPlacedLog.topics[1])
        : null;

      setRequestId(reqId);
      setState("pending_vrf");

      // 4. Poll for VRF settlement (Chainlink takes ~30s–2min on Base)
      if (reqId) {
        pollForResult(reqId);
      }

      return reqId;
    } catch (err) {
      setError(err.message || "Transaction failed");
      setState("idle");
      throw err;
    }
  }, [rawAllowance, writeContractAsync, publicClient, refetchUsdc]);

  const pollForResult = useCallback(async (reqId) => {
    const MAX_POLLS = 40;  // ~2 minutes at 3s intervals
    let polls = 0;

    const interval = setInterval(async () => {
      polls++;
      if (polls > MAX_POLLS) {
        clearInterval(interval);
        setError("VRF timeout — your bet is safe. Refresh to check status.");
        setState("idle");
        return;
      }

      try {
        const bet = await publicClient.readContract({
          address:      ADDRESSES.coinflip,
          abi:          COINFLIP_ABI,
          functionName: "getBet",
          args:         [reqId],
        });

        // status: 0=PENDING, 1=WON, 2=LOST, 3=REFUNDED
        if (bet.status !== 0) {
          clearInterval(interval);
          setResult({
            won:       bet.status === 1,
            payout:    formatUnits(bet.payout, 6),
            wager:     formatUnits(bet.wager,  6),
            choice:    bet.choice === 0 ? "HEADS" : "TAILS",
            // Derive result from randomWord
            result:    bet.randomWord % 2n === 0n ? "HEADS" : "TAILS",
            requestId: reqId.toString(),
          });
          setState("settled");
          refetchUsdc();
        }
      } catch (e) {
        // Silently continue polling
      }
    }, 3000);
  }, [publicClient, refetchUsdc]);

  const reset = useCallback(() => {
    setState("idle");
    setResult(null);
    setRequestId(null);
    setError(null);
  }, []);

  // Read player's bet history
  const { data: playerBetIds } = useReadContract({
    address:      ADDRESSES.coinflip,
    abi:          COINFLIP_ABI,
    functionName: "getPlayerBets",
    args:         [address],
    query:        { enabled: !!address },
  });

  return {
    placeBet,
    state,
    requestId: requestId?.toString(),
    result,
    error,
    reset,
    isPending: ["approving", "placing", "pending_vrf"].includes(state),
    playerBetIds: playerBetIds ?? [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK: useDiceRoll — place bets + listen for VRF settlement
// ─────────────────────────────────────────────────────────────────────────────
export function useDiceRoll() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [state, setState] = useState("idle");
  const [requestId, setRequestId] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const { rawAllowance, refetch: refetchUsdc } = useUsdcBalance();

  const placeBetRange = useCallback(async (wagerUsd, high) => {
    try {
      setError(null);
      setResult(null);
      const wager = parseUnits(wagerUsd.toString(), 6);

      if (rawAllowance < wager) {
        setState("approving");
        const approveTx = await writeContractAsync({
          address:      ADDRESSES.usdc,
          abi:          USDC_ABI,
          functionName: "approve",
          args:         [ADDRESSES.vault, wager * 1000n],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        refetchUsdc();
      }

      setState("placing");
      const betTx = await writeContractAsync({
        address:      ADDRESSES.diceroll,
        abi:          DICEROLL_ABI,
        functionName: "placeBetRange",
        args:         [wager, high],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: betTx });
      const log = receipt.logs.find(l =>
        l.address.toLowerCase() === ADDRESSES.diceroll.toLowerCase()
      );
      const reqId = log?.topics?.[1] ? BigInt(log.topics[1]) : null;

      setRequestId(reqId);
      setState("pending_vrf");
      if (reqId) pollForDiceResult(reqId);
      return reqId;
    } catch (err) {
      setError(err.message || "Transaction failed");
      setState("idle");
      throw err;
    }
  }, [rawAllowance, writeContractAsync, publicClient, refetchUsdc]);

  const placeBetExact = useCallback(async (wagerUsd, number) => {
    try {
      setError(null);
      setResult(null);
      const wager = parseUnits(wagerUsd.toString(), 6);

      if (rawAllowance < wager) {
        setState("approving");
        const approveTx = await writeContractAsync({
          address:      ADDRESSES.usdc,
          abi:          USDC_ABI,
          functionName: "approve",
          args:         [ADDRESSES.vault, wager * 1000n],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveTx });
        refetchUsdc();
      }

      setState("placing");
      const betTx = await writeContractAsync({
        address:      ADDRESSES.diceroll,
        abi:          DICEROLL_ABI,
        functionName: "placeBetExact",
        args:         [wager, number],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: betTx });
      const log = receipt.logs.find(l =>
        l.address.toLowerCase() === ADDRESSES.diceroll.toLowerCase()
      );
      const reqId = log?.topics?.[1] ? BigInt(log.topics[1]) : null;

      setRequestId(reqId);
      setState("pending_vrf");
      if (reqId) pollForDiceResult(reqId);
      return reqId;
    } catch (err) {
      setError(err.message || "Transaction failed");
      setState("idle");
      throw err;
    }
  }, [rawAllowance, writeContractAsync, publicClient, refetchUsdc]);

  const pollForDiceResult = useCallback(async (reqId) => {
    const MAX_POLLS = 40;
    let polls = 0;

    const interval = setInterval(async () => {
      polls++;
      if (polls > MAX_POLLS) {
        clearInterval(interval);
        setError("VRF timeout — your bet is safe. Refresh to check status.");
        setState("idle");
        return;
      }

      try {
        const bet = await publicClient.readContract({
          address:      ADDRESSES.diceroll,
          abi:          DICEROLL_ABI,
          functionName: "getBet",
          args:         [reqId],
        });

        if (bet.status !== 0) {
          clearInterval(interval);
          const betTypeLabel =
            bet.betType === 0 ? `Exact ${bet.exactNumber}` :
            bet.betType === 1 ? "LOW (1-3)" : "HIGH (4-6)";

          setResult({
            won:          bet.status === 1,
            payout:       formatUnits(bet.payout, 6),
            wager:        formatUnits(bet.wager,  6),
            rolledNumber: Number(bet.rolledNumber),
            betType:      bet.betType,
            betTypeLabel,
            requestId:    reqId.toString(),
          });
          setState("settled");
          refetchUsdc();
        }
      } catch (e) {
        // Continue polling
      }
    }, 3000);
  }, [publicClient, refetchUsdc]);

  const reset = useCallback(() => {
    setState("idle");
    setResult(null);
    setRequestId(null);
    setError(null);
  }, []);

  const { data: playerBetIds } = useReadContract({
    address:      ADDRESSES.diceroll,
    abi:          DICEROLL_ABI,
    functionName: "getPlayerBets",
    args:         [address],
    query:        { enabled: !!address },
  });

  return {
    placeBetRange,
    placeBetExact,
    state,
    requestId: requestId?.toString(),
    result,
    error,
    reset,
    isPending: ["approving", "placing", "pending_vrf"].includes(state),
    playerBetIds: playerBetIds ?? [],
  };
}
