"use client";
import { useState, useEffect, useCallback } from "react";
import { usePublicClient, useWalletClient, useAccount } from "wagmi";
import { formatUnits, keccak256, encodeAbiParameters } from "viem";

const BINGO_MP_ABI = [
  { name: "joinRound",       type: "function", stateMutability: "nonpayable", inputs: [{ name: "roundId", type: "uint256" }], outputs: [] },
  { name: "lockRound",       type: "function", stateMutability: "nonpayable", inputs: [{ name: "roundId", type: "uint256" }], outputs: [] },
  { name: "finalizeRound",   type: "function", stateMutability: "nonpayable", inputs: [{ name: "roundId", type: "uint256" }], outputs: [] },
  { name: "roundCount",      type: "function", stateMutability: "view",       inputs: [], outputs: [{ type: "uint256" }] },
  { name: "hasJoined",       type: "function", stateMutability: "view",       inputs: [{ name: "roundId", type: "uint256" }, { name: "player", type: "address" }], outputs: [{ type: "bool" }] },
  {
    name: "getRound", type: "function", stateMutability: "view",
    inputs: [{ name: "roundId", type: "uint256" }],
    outputs: [
      { name: "entryFee",      type: "uint256" },
      { name: "maxPlayers",    type: "uint256" },
      { name: "timerDuration", type: "uint256" },
      { name: "startTime",     type: "uint256" },
      { name: "prizePool",     type: "uint256" },
      { name: "mode",          type: "uint8"   },
      { name: "state",         type: "uint8"   },
      { name: "playerCount",   type: "uint256" },
      { name: "winners",       type: "address[]" },
      { name: "seeded",        type: "bool"    },
      { name: "entropySeqNum", type: "uint64"  },
    ],
  },
  { name: "getPlayerRounds", type: "function", stateMutability: "view", inputs: [{ name: "player", type: "address" }], outputs: [{ type: "uint256[]" }] },
  { name: "getPlayers",      type: "function", stateMutability: "view", inputs: [{ name: "roundId", type: "uint256" }], outputs: [{ type: "address[]" }] },
  { name: "getDrawnNumbers", type: "function", stateMutability: "view", inputs: [{ name: "roundId", type: "uint256" }], outputs: [{ type: "uint8[]" }] },
  { name: "getPlayerCard",   type: "function", stateMutability: "view", inputs: [{ name: "roundId", type: "uint256" }, { name: "player", type: "address" }], outputs: [{ type: "uint8[25]" }] },
  { name: "getOpenRounds",   type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256[]" }] },
  { name: "timeUntilLock",   type: "function", stateMutability: "view", inputs: [{ name: "roundId", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "getEntropyFee",   type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "getRandomSeed",   type: "function", stateMutability: "view", inputs: [{ name: "roundId", type: "uint256" }], outputs: [{ type: "bytes32" }] },
];

const USDC_ABI = [
  { name: "allowance", type: "function", stateMutability: "view",       inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "approve",   type: "function", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool" }] },
];

const MODE_NAMES  = ["Classic (Any Line)", "Blackout (Full Card)", "Corners", "X-Factor"];
const MODE_SHORT  = ["Any Line", "Blackout", "Corners", "X-Factor"];

const usd = (v) => `$${parseFloat(formatUnits(v || 0n, 6)).toFixed(2)}`;
const fmtTimer = (s) => {
  if (s <= 0) return "Expired";
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};
const shortAddr = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// Mirrors the Solidity _drawNumbers() function exactly.
// Given the Pyth bytes32 seed, returns the 75-number draw order.
function computeDrawnNumbers(randomSeed) {
  const drawSeed = keccak256(encodeAbiParameters(
    [{ type: "bytes32" }, { type: "string" }],
    [randomSeed, "draw"]
  ));
  const pool = Array.from({ length: 75 }, (_, i) => i + 1);
  for (let i = 74; i > 0; i--) {
    const h = keccak256(encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint8" }],
      [drawSeed, i]
    ));
    const j = Number(BigInt(h) % BigInt(i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function Spin() {
  return (
    <span style={{
      display: "inline-block", width: 13, height: 13,
      border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "var(--blue)",
      borderRadius: "50%", animation: "spin2 .7s linear infinite",
    }} />
  );
}

function Badge({ label, color, bg }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
      background: bg, color,
    }}>{label}</div>
  );
}

function BingoCard({ card, drawnNumbers }) {
  const drawn = new Set((drawnNumbers || []).map(Number));
  const cols  = ["B", "I", "N", "G", "O"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4, maxWidth: 270, margin: "0 auto" }}>
      {cols.map((c) => (
        <div key={c} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--blue)", padding: "4px 0", letterSpacing: 1 }}>{c}</div>
      ))}
      {(card || Array(25).fill(0)).map((num, i) => {
        const hit = drawn.has(Number(num));
        return (
          <div key={i} style={{
            height: 44, display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 8, fontSize: 13, fontWeight: 700, transition: "all .2s",
            background: hit ? "rgba(108,99,255,0.25)" : "rgba(255,255,255,0.05)",
            border: hit ? "1px solid rgba(108,99,255,0.5)" : "1px solid rgba(255,255,255,0.08)",
            color: hit ? "#fff" : "var(--sub)",
            boxShadow: hit ? "0 0 8px rgba(108,99,255,0.3)" : "none",
          }}>
            {num || ""}
          </div>
        );
      })}
    </div>
  );
}

function RoundTimer({ startTime, timerDuration, state }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (state !== 0 || startTime === 0n) { setRemaining(0); return; }
    const update = () => {
      const left = Number(startTime) + Number(timerDuration) - Math.floor(Date.now() / 1000);
      setRemaining(Math.max(0, left));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [startTime, timerDuration, state]);

  if (state !== 0 || startTime === 0n) return null;
  const urgent = remaining <= 30;
  return (
    <div style={{ fontSize: 11, color: urgent ? "var(--red)" : "var(--gold)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
      {remaining <= 0 ? "Timer expired — ready to lock" : `Locks in ${fmtTimer(remaining)}`}
    </div>
  );
}

export default function BingoMultiplayer({ contractAddress, usdcAddress, balance, refetchBalance, explorer }) {
  const { address } = useAccount();
  const publicClient  = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [rounds,       setRounds]       = useState([]);
  const [myRounds,     setMyRounds]     = useState({});
  const [cards,        setCards]        = useState({});
  const [drawnNumbers, setDrawnNumbers] = useState({});
  const [loading,       setLoading]       = useState(true);
  const [joining,       setJoining]       = useState(null);
  const [locking,       setLocking]       = useState(null);
  const [finalizing,    setFinalizing]    = useState(null);
  const [err,           setErr]           = useState(null);
  const [selectedRound, setSelectedRound] = useState(null);
  // previewDrawn: drawn numbers computed client-side for seeded-but-not-finalized rounds
  const [previewDrawn,  setPreviewDrawn]  = useState({});

  const readContract = useCallback((fn, args = []) =>
    publicClient.readContract({ address: contractAddress, abi: BINGO_MP_ABI, functionName: fn, args }),
    [publicClient, contractAddress]);

  const readUsdc = useCallback((fn, args = []) =>
    publicClient.readContract({ address: usdcAddress, abi: USDC_ABI, functionName: fn, args }),
    [publicClient, usdcAddress]);

  const loadRounds = useCallback(async () => {
    if (!contractAddress || !publicClient) return;
    try {
      const total = await readContract("roundCount");
      if (total === 0n) { setRounds([]); setLoading(false); return; }

      const ids = Array.from({ length: Number(total) }, (_, i) => BigInt(i));
      const roundData = await Promise.all(ids.map(async (id) => {
        const r      = await readContract("getRound", [id]);
        const joined = address ? await readContract("hasJoined", [id, address]) : false;
        let timeLeft = 0n;
        if (Number(r[6]) === 0 && r[3] > 0n) {
          try { timeLeft = await readContract("timeUntilLock", [id]); } catch {}
        }
        return {
          id,
          entryFee:     r[0],
          maxPlayers:   r[1],
          timerDuration:r[2],
          startTime:    r[3],
          prizePool:    r[4],
          mode:         Number(r[5]),
          state:        Number(r[6]),
          playerCount:  r[7],
          winners:      r[8],
          seeded:       r[9],
          joined,
          timeLeft,
        };
      }));

      setRounds(roundData.reverse());

      const joined = {};
      roundData.forEach(r => { if (r.joined) joined[r.id.toString()] = true; });
      setMyRounds(joined);

      // Load cards, drawn numbers, and preview data
      await Promise.all(roundData.map(async (r) => {
        const key = r.id.toString();

        // Cards available immediately after joining (all states)
        if (r.joined && address) {
          try {
            const card = await readContract("getPlayerCard", [r.id, address]);
            setCards(p => ({ ...p, [key]: Array.from(card) }));
          } catch {}
        }

        // Finalized rounds: fetch drawn numbers from chain
        if (r.state === 2) {
          try {
            const drawn = await readContract("getDrawnNumbers", [r.id]);
            setDrawnNumbers(p => ({ ...p, [key]: Array.from(drawn) }));
          } catch {}
        }

        // Seeded but not yet finalized: compute drawn numbers client-side from seed.
        // The seed is public and the draw is deterministic, so this preview is exact.
        if (r.state === 1 && r.seeded) {
          try {
            const seed = await readContract("getRandomSeed", [r.id]);
            const preview = computeDrawnNumbers(seed);
            setPreviewDrawn(p => ({ ...p, [key]: preview }));
          } catch {}
        }
      }));
    } catch (e) {
      console.error("loadRounds", e);
    } finally {
      setLoading(false);
    }
  }, [contractAddress, publicClient, address, readContract]);

  useEffect(() => {
    loadRounds();
    const id = setInterval(loadRounds, 12000);
    return () => clearInterval(id);
  }, [loadRounds]);

  async function handleJoin(roundId, entryFee) {
    setErr(null);
    setJoining(roundId.toString());
    try {
      const allowance = await readUsdc("allowance", [address, contractAddress]);
      if (allowance < entryFee) {
        const h = await walletClient.writeContract({
          address: usdcAddress, abi: USDC_ABI,
          functionName: "approve", args: [contractAddress, entryFee],
        });
        await publicClient.waitForTransactionReceipt({ hash: h });
      }
      const h = await walletClient.writeContract({
        address: contractAddress, abi: BINGO_MP_ABI,
        functionName: "joinRound", args: [roundId],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      try { localStorage.setItem(`txhash:bmp-${roundId}`, h); } catch {}
      await loadRounds();
      refetchBalance?.();
      setSelectedRound(roundId.toString());
    } catch (e) {
      setErr(e.shortMessage || e.message || "Transaction failed");
    } finally {
      setJoining(null);
    }
  }

  async function handleLock(roundId) {
    setErr(null);
    setLocking(roundId.toString());
    try {
      const h = await walletClient.writeContract({
        address: contractAddress, abi: BINGO_MP_ABI,
        functionName: "lockRound", args: [roundId],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      await loadRounds();
    } catch (e) {
      setErr(e.shortMessage || e.message || "Transaction failed");
    } finally {
      setLocking(null);
    }
  }

  async function handleFinalize(roundId) {
    setErr(null);
    setFinalizing(roundId.toString());
    try {
      const h = await walletClient.writeContract({
        address: contractAddress, abi: BINGO_MP_ABI,
        functionName: "finalizeRound", args: [roundId],
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      await loadRounds();
    } catch (e) {
      setErr(e.shortMessage || e.message || "Transaction failed");
    } finally {
      setFinalizing(null);
    }
  }

  if (!contractAddress) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "40px 24px", color: "var(--sub)", fontSize: 13 }}>
        Multiplayer Bingo contract not configured.{" "}
        Deploy the contract and set{" "}
        <code style={{ fontSize: 11, color: "var(--blue)", background: "rgba(108,99,255,.1)", padding: "2px 6px", borderRadius: 4 }}>
          NEXT_PUBLIC_BINGO_MULTIPLAYER_ADDRESS
        </code>.
      </div>
    );
  }

  const openRounds   = rounds.filter(r => r.state === 0);
  const lockedRounds = rounds.filter(r => r.state === 1);
  const closedRounds = rounds.filter(r => r.state === 2 || r.state === 3).slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Header */}
      <div className="card" style={{ background: "linear-gradient(135deg,rgba(108,99,255,.12),rgba(0,245,160,.06))", border: "1px solid rgba(108,99,255,.25)", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(108,99,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
          </svg>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--tx)", marginBottom: 4 }}>Multiplayer Bingo</div>
          <div style={{ fontSize: 12, color: "var(--sub)", lineHeight: 1.6 }}>
            Join a round, get your unique card instantly, and compete against other players on-chain.
          </div>
        </div>
      </div>

      {err && (
        <div style={{ fontSize: 12, color: "var(--red)", background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)", borderRadius: 10, padding: "10px 14px" }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 32, color: "var(--sub)", fontSize: 13 }}>
          <Spin /> Loading rounds…
        </div>
      ) : (
        <>
          {/* ── Open Rounds ─────────────────────────────────────────────────── */}
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--sub)", letterSpacing: "1.5px", padding: "0 4px" }}>
            OPEN ROUNDS {openRounds.length > 0 && `(${openRounds.length})`}
          </div>

          {openRounds.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "28px 16px", color: "var(--sub)", fontSize: 13 }}>
              No open rounds right now — check back soon.
            </div>
          ) : (
            openRounds.map((r) => {
              const key        = r.id.toString();
              const isJoined   = !!myRounds[key];
              const isFull     = r.playerCount >= r.maxPlayers;
              const isJoining  = joining === key;
              const canLock    = r.playerCount >= 2n && r.timeLeft === 0n && r.startTime > 0n;
              const isLocking  = locking === key;
              const isSelected = selectedRound === key;
              const myCard     = cards[key];

              return (
                <div key={key} className="card" style={{
                  border: isSelected ? "1px solid rgba(108,99,255,.5)" : "1px solid var(--bd)",
                  background: isSelected ? "rgba(108,99,255,.06)" : undefined,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--tx)", marginBottom: 3 }}>Round #{key}</div>
                      <div style={{ fontSize: 11, color: "var(--sub)" }}>{MODE_NAMES[r.mode]}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <Badge label="Open" color="var(--green)" bg="rgba(0,245,160,.12)" />
                      {isJoined && <Badge label="You're in ✓" color="#6C63FF" bg="rgba(108,99,255,.2)" />}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                    {[
                      { label: "Entry Fee",  value: usd(r.entryFee)  },
                      { label: "Prize Pool", value: usd(r.prizePool) },
                      { label: "Players",    value: `${r.playerCount.toString()} / ${r.maxPlayers.toString()}` },
                      { label: "Timer",      value: `${Number(r.timerDuration) / 60}m` },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ background: "rgba(255,255,255,.04)", borderRadius: 8, padding: "8px 12px" }}>
                        <div style={{ fontSize: 10, color: "var(--sub)", marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)" }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <RoundTimer startTime={r.startTime} timerDuration={r.timerDuration} state={r.state} />

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    {!isJoined && !isFull && (
                      <button className="btn primary" style={{ flex: 1, fontSize: 13, padding: "10px 0" }}
                        disabled={isJoining} onClick={() => handleJoin(r.id, r.entryFee)}>
                        {isJoining ? <><Spin /> Joining…</> : `Join — ${usd(r.entryFee)}`}
                      </button>
                    )}
                    {!isJoined && isFull && (
                      <div style={{ flex: 1, textAlign: "center", fontSize: 12, color: "var(--sub)", padding: "10px 0" }}>Round full</div>
                    )}
                    {isJoined && !canLock && (
                      <div style={{ flex: 1, textAlign: "center", fontSize: 12, color: "var(--sub)", padding: "10px 0" }}>Waiting for more players or timer…</div>
                    )}
                    {canLock && (
                      <button className="btn" style={{ flex: 1, fontSize: 13, padding: "10px 0", background: "rgba(245,158,11,.12)", border: "1px solid rgba(245,158,11,.3)", color: "var(--gold)" }}
                        disabled={isLocking} onClick={() => handleLock(r.id)}>
                        {isLocking ? <><Spin /> Locking…</> : "Lock & Draw"}
                      </button>
                    )}
                  </div>

                  {/* Show card immediately after joining */}
                  {isJoined && myCard && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 8, textAlign: "center" }}>Your card (pre-generated)</div>
                      <BingoCard card={myCard} drawnNumbers={[]} />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* ── Locked Rounds ───────────────────────────────────────────────── */}
          {lockedRounds.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--sub)", letterSpacing: "1.5px", padding: "4px 4px 0" }}>
                LOCKED ROUNDS
              </div>
              {lockedRounds.map((r) => {
                const key           = r.id.toString();
                const isFinalizing  = finalizing === key;
                const myCard        = cards[key];
                const preview       = previewDrawn[key] || [];
                const needsFinalize = r.seeded;

                return (
                  <div key={key} className="card" style={{ border: `1px solid ${needsFinalize ? "rgba(0,245,160,.25)" : "rgba(245,158,11,.25)"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--tx)" }}>Round #{key} — {MODE_SHORT[r.mode]}</div>
                        <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2 }}>
                          {r.playerCount.toString()} players · Prize pool: {usd(r.prizePool)}
                        </div>
                      </div>
                      <Badge
                        label={needsFinalize ? "Ready to Finalize" : "Awaiting Pyth…"}
                        color={needsFinalize ? "var(--green)" : "var(--gold)"}
                        bg={needsFinalize ? "rgba(0,245,160,.12)" : "rgba(245,158,11,.12)"}
                      />
                    </div>

                    {!needsFinalize && (
                      <div style={{ fontSize: 12, color: "var(--sub)", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                        <Spin /> Waiting for Pyth Entropy randomness…
                      </div>
                    )}

                    {needsFinalize && (
                      <>
                        {/* Preview drawn numbers — computed from the public Pyth seed */}
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 6 }}>
                            Numbers drawn ({preview.length}) — preview from seed
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {preview.map((n, i) => (
                              <span key={i} style={{
                                width: 28, height: 28, display: "inline-flex", alignItems: "center",
                                justifyContent: "center", borderRadius: 6,
                                background: "rgba(108,99,255,.15)", border: "1px solid rgba(108,99,255,.25)",
                                fontSize: 11, fontWeight: 700, color: "var(--tx)",
                              }}>{n}</span>
                            ))}
                          </div>
                        </div>
                        <button
                          className="btn primary"
                          style={{ width: "100%", fontSize: 13, padding: "10px 0", marginBottom: myRounds[key] && myCard ? 14 : 0 }}
                          disabled={isFinalizing}
                          onClick={() => handleFinalize(r.id)}
                        >
                          {isFinalizing ? <><Spin /> Finalizing…</> : "Finalize Round & Pay Winners"}
                        </button>
                      </>
                    )}

                    {myRounds[key] && myCard && (
                      <div style={{ marginTop: needsFinalize ? 0 : 8 }}>
                        <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 8, textAlign: "center" }}>
                          {needsFinalize ? "Your card — matched numbers highlighted" : "Your card"}
                        </div>
                        <BingoCard card={myCard} drawnNumbers={needsFinalize ? preview : []} />
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* ── Recent Rounds ───────────────────────────────────────────────── */}
          {closedRounds.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--sub)", letterSpacing: "1.5px", padding: "4px 4px 0" }}>
                RECENT ROUNDS
              </div>
              {closedRounds.map((r) => {
                const key        = r.id.toString();
                const isFinished = r.state === 2;
                const isMine     = !!myRounds[key];
                const myCard     = cards[key];
                const drawn      = drawnNumbers[key] || [];
                const iWon       = isFinished && r.winners.some(w => w.toLowerCase() === address?.toLowerCase());

                return (
                  <div key={key} className="card" style={{ border: iWon ? "1px solid rgba(0,245,160,.3)" : "1px solid var(--bd)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--tx)" }}>Round #{key} — {MODE_SHORT[r.mode]}</div>
                      <Badge
                        label={isFinished ? "Finished" : "Cancelled"}
                        color={isFinished ? "var(--blue)" : "var(--red)"}
                        bg={isFinished ? "rgba(108,99,255,.12)" : "rgba(239,68,68,.1)"}
                      />
                    </div>

                    {iWon && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--green)", background: "rgba(0,245,160,.08)", border: "1px solid rgba(0,245,160,.2)", borderRadius: 8, padding: "8px 12px", marginBottom: 10, textAlign: "center" }}>
                        You won {usd(r.prizePool * 9000n / 10000n / BigInt(r.winners.length))}
                      </div>
                    )}

                    <div style={{ fontSize: 12, color: "var(--sub)", display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
                      <span>{r.playerCount.toString()} players</span>
                      <span>Prize pool: {usd(r.prizePool)}</span>
                      {isFinished && r.winners.length > 0 && (
                        <span>Winner{r.winners.length > 1 ? "s" : ""}: {r.winners.map(shortAddr).join(", ")}</span>
                      )}
                    </div>

                    {isFinished && drawn.length > 0 && (
                      <div style={{ marginBottom: isMine && myCard ? 14 : 0 }}>
                        <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 6 }}>Numbers drawn ({drawn.length})</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {drawn.map((n, i) => (
                            <span key={i} style={{
                              width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center",
                              borderRadius: 6, background: "rgba(108,99,255,.15)", border: "1px solid rgba(108,99,255,.25)",
                              fontSize: 11, fontWeight: 700, color: "var(--tx)",
                            }}>{n}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {isMine && myCard && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 8, textAlign: "center" }}>Your card</div>
                        <BingoCard card={myCard} drawnNumbers={drawn} />
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {rounds.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--dim)", textAlign: "center", padding: "8px 0" }}>No rounds have been created yet.</div>
          )}
        </>
      )}

      <div style={{ fontSize: 10, color: "var(--dim)", textAlign: "center" }}>Pyth Entropy v2 · Provably fair</div>
    </div>
  );
}
