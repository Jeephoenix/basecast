"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { parseUnits, formatUnits } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";

const BTCPREDICT_ABI = [
  { name: "currentEpoch",   type: "function", stateMutability: "view",        inputs: [],                                                              outputs: [{ type: "uint256" }] },
  { name: "intervalSeconds",type: "function", stateMutability: "view",        inputs: [],                                                              outputs: [{ type: "uint256" }] },
  { name: "minBetAmount",   type: "function", stateMutability: "view",        inputs: [],                                                              outputs: [{ type: "uint256" }] },
  { name: "maxBetAmount",   type: "function", stateMutability: "view",        inputs: [],                                                              outputs: [{ type: "uint256" }] },
  { name: "paused",         type: "function", stateMutability: "view",        inputs: [],                                                              outputs: [{ type: "bool"    }] },
  { name: "getRound",       type: "function", stateMutability: "view",        inputs: [{ name: "epoch",  type: "uint256" }],                           outputs: [{ type: "tuple",  components: [
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
  { name: "betInfos",       type: "function", stateMutability: "view",        inputs: [{ name: "epoch", type: "uint256" }, { name: "user", type: "address" }], outputs: [
    { name: "amount",  type: "uint256" },
    { name: "isUp",    type: "bool"    },
    { name: "claimed", type: "bool"    },
  ]},
  { name: "getUserRounds",  type: "function", stateMutability: "view",        inputs: [{ name: "user",  type: "address" }],                           outputs: [{ type: "uint256[]" }] },
  { name: "claimable",      type: "function", stateMutability: "view",        inputs: [{ name: "epoch", type: "uint256" }, { name: "user", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "betUp",          type: "function", stateMutability: "nonpayable",  inputs: [{ name: "epoch", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "betDown",        type: "function", stateMutability: "nonpayable",  inputs: [{ name: "epoch", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "claim",          type: "function", stateMutability: "nonpayable",  inputs: [{ name: "epochs", type: "uint256[]" }],                        outputs: [] },
];

const USDC_ABI = [
  { name: "allowance", type: "function", stateMutability: "view",       inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "approve",   type: "function", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool"    }] },
];

const STATUS = { Pending: 0, Open: 1, Locked: 2, Ended: 3, Cancelled: 4 };
const INTERVAL = 60;

function friendlyErr(e) {
  const m = (e?.shortMessage || e?.message || "").toLowerCase();
  if (m.includes("user rejected") || m.includes("user denied")) return "Transaction cancelled.";
  if (m.includes("insufficient funds"))  return "Not enough ETH for gas.";
  if (m.includes("not bettable"))        return "Betting is closed for this round.";
  if (m.includes("already bet"))         return "You already placed a bet this round.";
  if (m.includes("below min"))           return "Bet is below the minimum amount.";
  if (m.includes("above max"))           return "Bet exceeds the maximum amount.";
  return e?.shortMessage || e?.message || "Transaction failed.";
}

function usd(n) {
  return "$" + (parseFloat(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmt6(bn) {
  return parseFloat(formatUnits(bn ?? 0n, 6));
}

function pythToUsd(price) {
  return price > 0 ? price / 1e8 : null;
}

// ── Sparkline chart ──────────────────────────────────────────────────────────
function PriceChart({ prices, height = 80 }) {
  if (prices.length < 2) return <div style={{ height }} />;
  const w = 300, h = height;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * w;
    const y = h - ((p - min) / range) * (h - 8) - 4;
    return `${x},${y}`;
  }).join(" ");
  const last = prices[prices.length - 1];
  const first = prices[0];
  const up = last >= first;
  const color = up ? "#22c55e" : "#ef4444";
  const lx = w, ly = h - ((last - min) / range) * (h - 8) - 4;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#chartGrad)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="3" fill={color} />
    </svg>
  );
}

// ── Circular countdown ───────────────────────────────────────────────────────
function RoundTimer({ secondsLeft, total = INTERVAL, status }) {
  const r = 22, circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, secondsLeft / total));
  const dash = pct * circ;
  const isLocked = status === STATUS.Locked || Number(status) === STATUS.Locked;
  const color = secondsLeft <= 10 ? "#ef4444" : "#22c55e";
  return (
    <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={isLocked ? "#6c63ff" : color}
          strokeWidth="3" strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round" transform="rotate(-90 28 28)" style={{ transition: "stroke-dasharray 0.9s linear" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--tx)", lineHeight: 1 }}>{secondsLeft}</div>
        <div style={{ fontSize: 8, color: "var(--sub)", letterSpacing: "0.5px" }}>SEC</div>
      </div>
    </div>
  );
}

// ── Pool split bar ───────────────────────────────────────────────────────────
function SplitBar({ upPct }) {
  const up = Math.round(upPct * 100);
  const dn = 100 - up;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 60 }}>
      <div style={{ fontSize: 9, color: "var(--sub)", letterSpacing: "1px" }}>SPLIT</div>
      <div style={{ width: 14, height: 80, borderRadius: 7, overflow: "hidden", background: "rgba(239,68,68,0.3)", display: "flex", flexDirection: "column" }}>
        <div style={{ height: `${up}%`, background: "#22c55e", transition: "height 0.5s ease", borderRadius: "7px 7px 0 0" }} />
      </div>
      <div style={{ fontSize: 9, color: "var(--sub)" }}>{up}%</div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function BTCPredict({ balance, refetchBalance, walletAddress, btcPredictAddress, usdcAddress, explorer }) {
  const [livePrice,    setLivePrice]    = useState(null);
  const [prevPrice,    setPrevPrice]    = useState(null);
  const [priceHistory, setPriceHistory] = useState([]);

  const [epoch,       setEpoch]       = useState(null);
  const [round,       setRound]       = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(INTERVAL);

  const [userBet,         setUserBet]         = useState(null);
  const [claimableEpochs, setClaimableEpochs] = useState([]);
  const [prevRound,       setPrevRound]       = useState(null);

  const [choice,   setChoice]   = useState("up");
  const [wager,    setWager]    = useState("10");
  const [betState, setBetState] = useState("idle");
  const [betErr,   setBetErr]   = useState("");

  const [claiming,     setClaiming]     = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);

  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const wsRef     = useRef(null);
  const epochRef  = useRef(null);
  const pollTimer = useRef(null);

  // ── Live price via Binance WebSocket ──────────────────────────────────────
  useEffect(() => {
    let ws;
    function connect() {
      ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@aggTrade");
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data);
        const p = parseFloat(d.p);
        setLivePrice(prev => { setPrevPrice(prev); return p; });
        setPriceHistory(h => [...h.slice(-119), p]);
      };
      ws.onclose = () => { setTimeout(connect, 3000); };
      wsRef.current = ws;
    }
    connect();
    return () => { try { ws?.close(); } catch (_) {} };
  }, []);

  // ── Poll round data every 5 s ─────────────────────────────────────────────
  const fetchRound = useCallback(async () => {
    if (!publicClient || !btcPredictAddress) return;
    try {
      const e = await publicClient.readContract({
        address: btcPredictAddress, abi: BTCPREDICT_ABI, functionName: "currentEpoch",
      });
      epochRef.current = e;
      setEpoch(e);

      const [r, prevR] = await Promise.all([
        publicClient.readContract({ address: btcPredictAddress, abi: BTCPREDICT_ABI, functionName: "getRound", args: [e] }),
        e > 1n
          ? publicClient.readContract({ address: btcPredictAddress, abi: BTCPREDICT_ABI, functionName: "getRound", args: [e - 1n] })
          : Promise.resolve(null),
      ]);
      setRound(r);
      setPrevRound(prevR);

      const now = BigInt(Math.floor(Date.now() / 1000));
      const sLeft = r.lockTimestamp > now ? Number(r.lockTimestamp - now) : 0;
      setSecondsLeft(sLeft);

      if (walletAddress) {
        const [bet, userRoundsList] = await Promise.all([
          publicClient.readContract({ address: btcPredictAddress, abi: BTCPREDICT_ABI, functionName: "betInfos", args: [e, walletAddress] }),
          publicClient.readContract({ address: btcPredictAddress, abi: BTCPREDICT_ABI, functionName: "getUserRounds", args: [walletAddress] }),
        ]);
        setUserBet(bet.amount > 0n ? bet : null);

        const recent = userRoundsList.filter(re => re !== e).slice(-10);
        const flags = await Promise.all(
          recent.map(re => publicClient.readContract({ address: btcPredictAddress, abi: BTCPREDICT_ABI, functionName: "claimable", args: [re, walletAddress] }))
        );
        setClaimableEpochs(recent.filter((_, i) => flags[i]));
      }
    } catch (err) {
      console.error("BTCPredict fetchRound:", err);
    }
  }, [publicClient, btcPredictAddress, walletAddress]);

  useEffect(() => {
    fetchRound();
    pollTimer.current = setInterval(fetchRound, 5000);
    return () => clearInterval(pollTimer.current);
  }, [fetchRound]);

  // ── Local countdown tick ──────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Trigger keeper when round expires ────────────────────────────────────
  useEffect(() => {
    if (secondsLeft === 0 && round) {
      const st = Number(round.status);
      if (st === STATUS.Open || st === STATUS.Locked) {
        fetch("/api/btc-keeper").catch(() => {});
      }
    }
  }, [secondsLeft, round]);

  // Reset bet state when epoch changes
  useEffect(() => { setBetState("idle"); setBetErr(""); }, [epoch]);

  // ── Bet ──────────────────────────────────────────────────────────────────
  const doBet = async (isUp) => {
    if (!walletClient || !btcPredictAddress || epoch == null) return;
    const amount = parseUnits(wager, 6);
    setBetState("approving");
    setBetErr("");
    try {
      const allowance = await publicClient.readContract({
        address: usdcAddress, abi: USDC_ABI, functionName: "allowance",
        args: [walletAddress, btcPredictAddress],
      });
      if (allowance < amount) {
        const h = await walletClient.writeContract({
          address: usdcAddress, abi: USDC_ABI, functionName: "approve",
          args: [btcPredictAddress, amount],
        });
        await publicClient.waitForTransactionReceipt({ hash: h });
      }
      setBetState("betting");
      const h2 = await walletClient.writeContract({
        address: btcPredictAddress, abi: BTCPREDICT_ABI,
        functionName: isUp ? "betUp" : "betDown",
        args: [epoch, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash: h2 });
      setBetState("placed");
      fetchRound();
      refetchBalance?.();
    } catch (err) {
      setBetState("error");
      setBetErr(friendlyErr(err));
    }
  };

  // ── Claim ────────────────────────────────────────────────────────────────
  const doClaim = async () => {
    if (!walletClient || !claimableEpochs.length) return;
    setClaiming(true);
    setClaimSuccess(false);
    try {
      const h = await walletClient.writeContract({
        address: btcPredictAddress, abi: BTCPREDICT_ABI,
        functionName: "claim", args: [claimableEpochs],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      setClaimableEpochs([]);
      setClaimSuccess(true);
      fetchRound();
      refetchBalance?.();
      setTimeout(() => setClaimSuccess(false), 4000);
    } catch (err) {
      console.error("BTCPredict claim:", err);
    }
    setClaiming(false);
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const upAmt   = round ? fmt6(round.upAmount)   : 0;
  const downAmt = round ? fmt6(round.downAmount) : 0;
  const totalAmt = upAmt + downAmt;
  const upPct    = totalAmt > 0 ? upAmt / totalAmt : 0.5;
  const pool     = totalAmt * 0.97;
  const upMult   = upAmt   > 0 ? pool / upAmt   : 1.94;
  const downMult = downAmt > 0 ? pool / downAmt : 1.94;
  const wagerN   = parseFloat(wager) || 0;
  const estPayout = choice === "up" ? wagerN * upMult : wagerN * downMult;

  const roundStatus = round ? Number(round.status) : -1;
  const isOpen      = roundStatus === STATUS.Open;
  const isLocked    = roundStatus === STATUS.Locked;
  const canBet      = isOpen && secondsLeft > 0 && !userBet && btcPredictAddress;
  const betClosingSoon = isOpen && secondsLeft <= 10 && secondsLeft > 0;

  const priceUp = livePrice != null && prevPrice != null ? livePrice >= prevPrice : true;
  const lockPriceUsd   = round?.lockPrice  ? pythToUsd(Number(round.lockPrice))  : null;
  const closePriceUsd  = round?.closePrice ? pythToUsd(Number(round.closePrice)) : null;

  const isBusy = betState === "approving" || betState === "betting";

  const Spin = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      style={{ animation: "spin 0.8s linear infinite", display: "inline-block" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );

  if (!btcPredictAddress) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "40px 24px", color: "var(--sub)", fontSize: 14 }}>
        BTC Predict contract not configured.<br />
        <span style={{ fontSize: 12 }}>Set <code>NEXT_PUBLIC_BTCPREDICT_ADDRESS</code> to enable.</span>
      </div>
    );
  }

  return (
    <div className="fi" style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Price chart card ───────────────────────────────────────────── */}
      <div className="card" style={{ padding: "16px 16px 10px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%,rgba(34,197,94,.05),transparent 70%)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#F7931A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff" }}>₿</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx)", lineHeight: 1.2 }}>BTC / USD</div>
                <div style={{ fontSize: 9, color: "var(--sub)", letterSpacing: "0.5px" }}>BINANCE LIVE</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e", animation: "pulse 2s ease-in-out infinite" }} />
            <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 600 }}>LIVE</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: priceUp ? "#22c55e" : "#ef4444", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px" }}>
            {livePrice != null ? usd(livePrice) : "$--"}
          </div>
          {lockPriceUsd && (
            <div style={{ fontSize: 11, color: "var(--sub)" }}>
              lock <span style={{ color: "var(--tx)" }}>{usd(lockPriceUsd)}</span>
            </div>
          )}
        </div>

        <PriceChart prices={priceHistory} height={72} />
        <div style={{ fontSize: 9, color: "var(--dim)", textAlign: "right", marginTop: 4 }}>price data via Binance</div>
      </div>

      {/* ── Round info card ────────────────────────────────────────────── */}
      <div className="card" style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <RoundTimer secondsLeft={secondsLeft} total={INTERVAL} status={roundStatus} />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                background: isLocked ? "rgba(108,99,255,0.18)" : isOpen ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)",
                color: isLocked ? "#a78bfa" : isOpen ? "#22c55e" : "var(--sub)",
                border: `1px solid ${isLocked ? "rgba(108,99,255,0.3)" : isOpen ? "rgba(34,197,94,0.3)" : "transparent"}`,
              }}>
                {isOpen ? "● OPEN" : isLocked ? "● LOCKED" : roundStatus === STATUS.Ended ? "ENDED" : roundStatus === STATUS.Cancelled ? "CANCELLED" : "PENDING"}
              </div>
              {epoch != null && <div style={{ fontSize: 11, color: "var(--sub)" }}>Round #{epoch.toString()}</div>}
            </div>
            {isOpen && secondsLeft > 0 && (
              <div style={{ fontSize: 11, color: betClosingSoon ? "#ef4444" : "var(--sub)" }}>
                {betClosingSoon ? `⚠ Bet closes in ~${secondsLeft}s` : `Bet closes in ~${secondsLeft}s · Entry $`}
              </div>
            )}
            {isLocked && <div style={{ fontSize: 11, color: "var(--sub)" }}>Locked · waiting for close price</div>}
          </div>
        </div>
      </div>

      {/* ── Claim banner ───────────────────────────────────────────────── */}
      {claimableEpochs.length > 0 && (
        <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#22c55e" }}>🎉 You won!</div>
            <div style={{ fontSize: 11, color: "var(--sub)" }}>{claimableEpochs.length} round{claimableEpochs.length > 1 ? "s" : ""} ready to claim</div>
          </div>
          <button
            onClick={doClaim}
            disabled={claiming}
            style={{ background: "#22c55e", color: "#000", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            {claiming ? <><Spin /> Claiming...</> : "Claim"}
          </button>
        </div>
      )}

      {claimSuccess && (
        <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#22c55e", textAlign: "center" }}>
          ✓ Winnings claimed!
        </div>
      )}

      {/* ── UP / DOWN pool split ───────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        {/* UP pool */}
        <div style={{ flex: 1, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 12, padding: "12px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
            <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,1 9,9 1,9" fill="#22c55e" /></svg>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", letterSpacing: "1px" }}>UP</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--tx)" }}>{usd(upAmt)}</div>
          <div style={{ fontSize: 10, color: "var(--sub)", marginTop: 2 }}>{upMult.toFixed(2)}× payout</div>
        </div>

        <SplitBar upPct={upPct} />

        {/* DOWN pool */}
        <div style={{ flex: 1, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 12, padding: "12px 14px", textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end", marginBottom: 6 }}>
            <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,9 1,1 9,1" fill="#ef4444" /></svg>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", letterSpacing: "1px" }}>DOWN</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--tx)" }}>{usd(downAmt)}</div>
          <div style={{ fontSize: 10, color: "var(--sub)", marginTop: 2 }}>{downMult.toFixed(2)}× payout</div>
        </div>
      </div>

      {/* ── Already bet this round ─────────────────────────────────────── */}
      {userBet && (
        <div style={{ background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.2)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 22 }}>{userBet.isUp ? "▲" : "▼"}</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)" }}>
              Bet {userBet.isUp ? "UP" : "DOWN"} · {usd(fmt6(userBet.amount))}
            </div>
            <div style={{ fontSize: 11, color: "var(--sub)" }}>
              {isLocked ? "Locked · waiting for result…" : isOpen ? "Placed · round closing soon" : "Settled"}
            </div>
          </div>
        </div>
      )}

      {/* ── Betting UI ─────────────────────────────────────────────────── */}
      {!userBet && (
        <>
          {/* UP / DOWN choice */}
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { id: "up",   label: "UP",   mult: upMult,   color: "#22c55e", bg: "rgba(34,197,94,0.1)",  border: "rgba(34,197,94,0.35)",  icon: "▲" },
              { id: "down", label: "DOWN", mult: downMult, color: "#ef4444", bg: "rgba(239,68,68,0.1)",  border: "rgba(239,68,68,0.35)",  icon: "▼" },
            ].map(({ id, label, mult, color, bg, border, icon }) => (
              <button
                key={id}
                onClick={() => setChoice(id)}
                disabled={isBusy || !canBet}
                style={{
                  flex: 1, padding: "18px 10px", borderRadius: 12, border: `2px solid ${choice === id ? color : "var(--bd)"}`,
                  background: choice === id ? bg : "var(--s2)", cursor: canBet ? "pointer" : "default",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6, transition: "all .15s",
                  opacity: !canBet ? 0.5 : 1,
                }}>
                <span style={{ fontSize: 24, color }}>{icon}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: choice === id ? color : "var(--tx)" }}>{label}</span>
                <span style={{ fontSize: 11, color: "var(--sub)" }}>{mult.toFixed(2)}× payout</span>
              </button>
            ))}
          </div>

          {/* Wager */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 10, color: "var(--sub)", letterSpacing: "2px" }}>WAGER (CREDITS)</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "var(--sub)", fontSize: 18 }}>$</span>
              <input
                className="inp" type="number" min="0.5" value={wager}
                onChange={e => setWager(e.target.value)}
                disabled={isBusy || !canBet}
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {["5", "10", "25", "50", "100"].map(v => (
                <button key={v}
                  onClick={() => setWager(v)}
                  disabled={isBusy || !canBet}
                  style={{
                    flex: 1, padding: "6px 0", borderRadius: 7, border: "1px solid var(--bd)",
                    background: wager === v ? "var(--blue)" : "var(--s2)",
                    color: wager === v ? "#fff" : "var(--sub)", fontSize: 12, cursor: "pointer", fontWeight: 600,
                  }}>
                  ${v}
                </button>
              ))}
            </div>
            {wagerN > 0 && canBet && (
              <div style={{ fontSize: 11, color: "var(--sub)", display: "flex", justifyContent: "space-between" }}>
                <span>Est. payout</span>
                <span style={{ color: choice === "up" ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{usd(estPayout)}</span>
              </div>
            )}
          </div>

          {/* Submit button */}
          <button
            className="btn primary"
            style={{
              fontSize: 15, padding: 16, gap: 8,
              background: canBet ? (choice === "up" ? "#22c55e" : "#ef4444") : undefined,
              opacity: isBusy || !canBet ? 0.6 : 1,
            }}
            disabled={isBusy || !canBet || !wagerN}
            onClick={() => doBet(choice === "up")}>
            {isBusy ? (
              <><Spin />{betState === "approving" ? "Approving USDC…" : "Placing bet…"}</>
            ) : betState === "placed" ? (
              "✓ Bet placed!"
            ) : !canBet && isLocked ? (
              "⚡ Round locked"
            ) : !canBet && !isOpen ? (
              "Waiting for next round…"
            ) : (
              <span className="shimmer">
                {choice === "up" ? "▲" : "▼"} PREDICT {choice.toUpperCase()} · {usd(wagerN)}
              </span>
            )}
          </button>

          {betErr && (
            <div style={{ fontSize: 12, color: "#ef4444", textAlign: "center", padding: "0 8px" }}>{betErr}</div>
          )}
        </>
      )}

      {/* ── Previous round result ───────────────────────────────────────── */}
      {prevRound && Number(prevRound.status) === STATUS.Ended && (
        <div className="card" style={{ padding: "12px 16px" }}>
          <div style={{ fontSize: 10, color: "var(--sub)", letterSpacing: "1.5px", marginBottom: 8 }}>PREV ROUND #{prevRound.epoch.toString()}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "var(--sub)" }}>
              Lock <span style={{ color: "var(--tx)", fontWeight: 600 }}>{usd(pythToUsd(Number(prevRound.lockPrice)))}</span>
              {" → "}
              Close <span style={{ color: prevRound.closePrice > prevRound.lockPrice ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                {usd(pythToUsd(Number(prevRound.closePrice)))}
              </span>
            </div>
            <div style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
              background: prevRound.closePrice > prevRound.lockPrice ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              color: prevRound.closePrice > prevRound.lockPrice ? "#22c55e" : "#ef4444",
            }}>
              {prevRound.closePrice > prevRound.lockPrice ? "▲ UP WON" : "▼ DOWN WON"}
            </div>
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: "var(--dim)", textAlign: "center" }}>
        Pyth Price Feed · 1-min rounds
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin  { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
