"use client";
// components/BingoGame.jsx
// Handles TURBO (3x3), SPEED (5x5), PATTERN (5x5 with pattern selection)

import { useState, useCallback } from "react";
import { usePublicClient, useWalletClient, useAccount } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { ConsentModal, hasConsented } from "@/components/PolicyModal";
// Icon components for mode tabs
const ZapIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
);
const GaugeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12 4.93 4.93"/><circle cx="12" cy="12" r="1.5"/></svg>
);
const TargetIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
);

// ── ABI ───────────────────────────────────────────────────────────────────────
const BINGO_ABI = [
  { name:"placeTurbo",   type:"function", stateMutability:"payable",
    inputs:[{name:"wager",type:"uint256"}], outputs:[{name:"seqNum",type:"uint64"}] },
  { name:"placeSpeed",   type:"function", stateMutability:"payable",
    inputs:[{name:"wager",type:"uint256"}], outputs:[{name:"seqNum",type:"uint64"}] },
  { name:"placePattern", type:"function", stateMutability:"payable",
    inputs:[{name:"wager",type:"uint256"},{name:"pattern",type:"uint8"}],
    outputs:[{name:"seqNum",type:"uint64"}] },
  { name:"getBet",       type:"function", stateMutability:"view",
    inputs:[{name:"seqNum",type:"uint64"}],
    outputs:[{name:"",type:"tuple",components:[
      {name:"player",type:"address"},{name:"wager",type:"uint96"},
      {name:"mode",type:"uint8"},{name:"pattern",type:"uint8"},
      {name:"status",type:"uint8"},{name:"payout",type:"uint96"},
      {name:"timestamp",type:"uint32"},{name:"randomSeed",type:"bytes32"},
      {name:"gridSize",type:"uint8"},
    ]}] },
  { name:"getEntropyFee",type:"function", stateMutability:"view",
    inputs:[], outputs:[{type:"uint128"}] },
  { name:"getPlayerBets",type:"function", stateMutability:"view",
    inputs:[{name:"player",type:"address"}], outputs:[{type:"uint64[]"}] },
  // Events
  { name:"BingoResult",  type:"event",
    inputs:[
      {name:"seqNum",      type:"uint64",   indexed:true},
      {name:"player",      type:"address",  indexed:true},
      {name:"wager",       type:"uint256",  indexed:false},
      {name:"payout",      type:"uint256",  indexed:false},
      {name:"won",         type:"bool",     indexed:false},
      {name:"mode",        type:"uint8",    indexed:false},
      {name:"drawnNumbers",type:"uint8[]",  indexed:false},
      {name:"card",        type:"uint8[]",  indexed:false},
    ]},
];

const USDC_ABI = [
  { name:"allowance", type:"function", stateMutability:"view",
    inputs:[{name:"owner",type:"address"},{name:"spender",type:"address"}],
    outputs:[{type:"uint256"}] },
  { name:"approve",   type:"function", stateMutability:"nonpayable",
    inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}],
    outputs:[{type:"bool"}] },
];

const BINGO_ADDR = process.env.NEXT_PUBLIC_BINGO_ADDRESS;
const VAULT_ADDR = process.env.NEXT_PUBLIC_VAULT_ADDRESS;
const USDC_ADDR  = process.env.NEXT_PUBLIC_USDC_ADDRESS;

// ── Helpers ───────────────────────────────────────────────────────────────────
const usd = (v) => `$${parseFloat(formatUnits(v||0n,6)).toFixed(2)}`;

function playBingoWin() {
// Fanfare + applause
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    [523, 659, 784, 1047, 1319].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.28);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.3);
    });

    for (let b = 0; b < 10; b++) {
      const bufferSize = Math.floor(ctx.sampleRate * 0.12);
      const buffer     = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data       = buffer.getChannelData(0);
      for (let j = 0; j < bufferSize; j++) data[j] = Math.random() * 2 - 1;

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type            = "bandpass";
      filter.frequency.value = 1800 + Math.random() * 2400;
      filter.Q.value         = 0.4;

      const gain      = ctx.createGain();
      const startTime = ctx.currentTime + 0.6 + b * 0.16;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.12, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.11);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(startTime);
    }
  } catch {}
}

function playBingoLose() {
  // Sad descending trombone-style sound only

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [349, 311, 277, 233].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.2);
      gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.38);
      osc.start(ctx.currentTime + i * 0.2);
      osc.stop(ctx.currentTime + i * 0.2 + 0.4);
    });
  } catch {}
}

const MODES = [
  { id:0, key:"TURBO",   label:"Turbo",   icon: <ZapIcon />,    grid:3, desc:"3×3 · Fastest · Any line wins" },
  { id:1, key:"SPEED",   label:"Speed",   icon: <GaugeIcon />,  grid:5, desc:"5×5 · First line or full card"  },
  { id:2, key:"PATTERN", label:"Pattern", icon: <TargetIcon />, grid:5, desc:"5×5 · Choose your pattern"      },
];

const PATTERNS = [
  { id:0, label:"Any Line",  mult:"2.4×",  desc:"Any row, column or diagonal",  icon:"━" },
  { id:1, label:"X Shape",   mult:"4.5×",  desc:"Both diagonals crossed",        icon:"✕" },
  { id:2, label:"Corners",   mult:"3.5×",  desc:"Four corner squares",           icon:"⬛"},
  { id:3, label:"T Shape",   mult:"3.8×",  desc:"Top row + middle column",       icon:"T" },
  { id:4, label:"Full Card", mult:"20×",   desc:"All 25 numbers matched",        icon:"⬛"},
];

const MODE_PAYOUTS = {
  0: [{ label:"Any Line", mult:"2.9×" }, { label:"Full Card", mult:"8×"  }],
  1: [{ label:"Any Line", mult:"2.4×" }, { label:"Full Card", mult:"18×" }],
  2: PATTERNS.map(p=>({ label:p.label, mult:p.mult })),
};

// ── Pattern visualiser ────────────────────────────────────────────────────────
function PatternPreview({ patternId, size=5 }) {
  const highlights = {
    0: [0,1,2,3,4],                          // top row (any line example)
    1: [0,6,12,18,24,4,8,16,20],             // X
    2: [0,4,20,24],                          // corners
    3: [0,1,2,3,4,2,7,12,17,22],            // T
    4: Array.from({length:25},(_,i)=>i),     // full
  };
  const hi = new Set(highlights[patternId]||[]);
  return (
    <div style={{
      display:"grid",
      gridTemplateColumns:`repeat(${size},1fr)`,
      gap:2, width:60, height:60,
    }}>
      {Array.from({length:size*size},(_,i)=>(
        <div key={i} style={{
          borderRadius:2,
          background: hi.has(i) ? "#2563EB" : "#1E2130",
        }}/>
      ))}
    </div>
  );
}

// ── Bingo Card Display ────────────────────────────────────────────────────────
function BingoCard({ card, drawn, gridSize, won, lost }) {
  if (!card || card.length === 0) return null;
  const drawnSet = new Set(drawn||[]);
  const cols = gridSize;

  return (
    <div style={{
      display:"grid",
      gridTemplateColumns:`repeat(${cols},1fr)`,
      gap:4, width:"100%",
    }}>
      {card.map((num,i) => {
        const isDrawn   = drawnSet.has(Number(num));
        const isWinCell = won && isDrawn;
        return (
          <div key={i} style={{
            aspectRatio:"1",
            borderRadius:6,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontFamily:"'JetBrains Mono',monospace",
            fontSize: gridSize===3 ? 16 : 11,
            fontWeight:600,
            background: isWinCell
              ? "rgba(16,185,129,0.2)"
              : isDrawn
              ? "rgba(37,99,235,0.25)"
              : "#13151C",
            border: isWinCell
              ? "1.5px solid #10B981"
              : isDrawn
              ? "1.5px solid #2563EB"
              : "1.5px solid #1E2130",
            color: isWinCell ? "#10B981" : isDrawn ? "#93C5FD" : "#6B7280",
            transition:"all 0.3s",
          }}>
            {num}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function BingoGame({ balance, refetchBalance }) {
  const { address }          = useAccount();
  const pub                  = usePublicClient();
  const { data: wc }         = useWalletClient();

  const [mode,      setMode]      = useState(0);       // 0=TURBO 1=SPEED 2=PATTERN
  const [pattern,   setPattern]   = useState(0);       // pattern index
  const [wager,     setWager]     = useState("1");
  const [state,       setState]       = useState("idle");  // idle|approving|placing|pending|settled
const [result,      setResult]      = useState(null);
const [error,       setError]       = useState(null);
const [showConsent, setShowConsent] = useState(false);

  // ── Allowance ───────────────────────────────────────────────────────────────
  const ensureAllow = async (amt) => {
    const al = await pub.readContract({
      address:USDC_ADDR, abi:USDC_ABI,
      functionName:"allowance", args:[address, VAULT_ADDR]
    });
    if (al >= amt) return;
    const {request} = await pub.simulateContract({
      address:USDC_ADDR, abi:USDC_ABI,
      functionName:"approve", args:[VAULT_ADDR, amt*1000n],
      account:address,
    });
    const h = await wc.writeContract(request);
    await pub.waitForTransactionReceipt({hash:h});
  };

  // ── Poll for result ──────────────────────────────────────────────────────────
  const pollResult = (seqNum) => {
    let i = 0;
    const iv = setInterval(async () => {
      if (++i > 90) { clearInterval(iv); setError("Timeout — bet is safe, check history"); setState("idle"); return; }
      try {
        const bet = await pub.readContract({
          address:BINGO_ADDR, abi:BINGO_ABI,
          functionName:"getBet", args:[seqNum]
        });
        if (bet.status !== 0) {
          clearInterval(iv);
          // Re-read result from BingoResult event logs
                    const latestBlock = await pub.getBlockNumber();
          const fromBlock = latestBlock > 500n ? latestBlock - 500n : 0n;
          const logs = await pub.getLogs({
            address:BINGO_ADDR,
            event: BINGO_ABI.find(x=>x.name==="BingoResult"),
            args:  { seqNum },
            fromBlock,
            toBlock: "latest",
          });
                    let card=[], drawn=[];
          if (logs[0]?.args) { card=logs[0].args.card||[]; drawn=logs[0].args.drawnNumbers||[]; }
          const won = bet.status === 1;
          won ? playBingoWin() : playBingoLose();
          setResult({
            won,
            payout: bet.payout,
            wager:  bet.wager,
            mode:   bet.mode,
            card:   card.map(Number),
            drawn:  drawn.map(Number),
            gridSize: bet.gridSize,
          });
          setState("settled");
          refetchBalance?.();
        }
      } catch {}
    }, 2500);
  };

  // ── Place Bet ────────────────────────────────────────────────────────────────
  const placeBet = useCallback(async () => {
    if (!hasConsented()) { setShowConsent(true); return; }
    if (!address || !wc || !BINGO_ADDR) return;
    setError(null); setResult(null);
    try {
      const w = parseUnits(wager, 6);

      setState("approving");
      await ensureAllow(w);

      const fee = await pub.readContract({
        address:BINGO_ADDR, abi:BINGO_ABI, functionName:"getEntropyFee"
      });

      setState("placing");
      let req;

      if (mode === 0) {
        const {request} = await pub.simulateContract({
          address:BINGO_ADDR, abi:BINGO_ABI, functionName:"placeTurbo",
          args:[w], value:fee, account:address,
        });
        req = request;
      } else if (mode === 1) {
        const {request} = await pub.simulateContract({
          address:BINGO_ADDR, abi:BINGO_ABI, functionName:"placeSpeed",
          args:[w], value:fee, account:address,
        });
        req = request;
      } else {
        const {request} = await pub.simulateContract({
          address:BINGO_ADDR, abi:BINGO_ABI, functionName:"placePattern",
          args:[w, pattern], value:fee, account:address,
        });
        req = request;
      }

      const hash    = await wc.writeContract(req);
const receipt = await pub.waitForTransactionReceipt({hash});
const seq     = receipt.logs.at(-1)?.topics?.[1]
  ? BigInt(receipt.logs.at(-1).topics[1]) : null;
if (seq !== null) localStorage.setItem(`txhash:bingo-${seq}`, hash); // ← ADD THIS LINE
setState("pending");
      if (seq !== null) pollResult(seq);
    } catch(e) {
      setError(e.shortMessage || e.message || "Transaction failed");
      setState("idle");
    }
  }, [address, wc, pub, wager, mode, pattern]);

    const PATTERN_MULTS = [2.4, 4.5, 3.5, 3.8, 20];
  const winMult = mode === 0 ? 2.9 : mode === 1 ? 2.4 : PATTERN_MULTS[pattern];
  const busy  = ["approving","placing","pending"].includes(state);
  const balF  = parseFloat(formatUnits(balance||0n, 6));
  const wagerF= parseFloat(wager||0);

  const btnLabel = () => {
    if (state==="approving") return "Approving USDC...";
    if (state==="placing")   return "Placing bet...";
    if (state==="pending")   return "Drawing numbers...";
    const mLabel = ["PLAY TURBO","PLAY SPEED","PLAY PATTERN"][mode];
    return `${mLabel} · $${wager}`;
  };

    return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {showConsent && <ConsentModal onAccept={() => setShowConsent(false)} />}

      {/* Mode Selector */}
      <div style={{display:"flex",gap:8}}>
        {MODES.map(m=>(
          <button key={m.id}
            onClick={()=>{setMode(m.id);setResult(null);setError(null);}}
            disabled={busy}
            style={{
              flex:1,padding:"12px 8px",border:"none",borderRadius:10,
              cursor:"pointer",transition:"all 0.15s",
              fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:12,
              background: mode===m.id ? "#2563EB" : "#13151C",
              color:       mode===m.id ? "#fff"     : "#6B7280",
              outline: mode===m.id ? "2px solid rgba(37,99,235,0.4)" : "none",
            }}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
  {m.icon}{m.label}
</div>
            <div style={{fontSize:9,fontWeight:400,marginTop:3,
              color:mode===m.id?"rgba(255,255,255,0.7)":"#374151"}}>{m.desc}</div>
          </button>
        ))}
      </div>

      {/* Pattern Selector — only in PATTERN mode */}
      {mode === 2 && (
        <div style={{
          background:"#0E1017",border:"1px solid #1E2130",
          borderRadius:12,padding:14,display:"flex",flexDirection:"column",gap:10,
        }}>
          <div style={{fontSize:10,color:"#6B7280",letterSpacing:"2px"}}>CHOOSE PATTERN</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {PATTERNS.map(p=>(
              <button key={p.id}
                onClick={()=>setPattern(p.id)}
                disabled={busy}
                style={{
                  display:"flex",alignItems:"center",gap:12,padding:"10px 12px",
                  background:pattern===p.id?"rgba(37,99,235,0.12)":"transparent",
                  border:`1.5px solid ${pattern===p.id?"#2563EB":"#1E2130"}`,
                  borderRadius:8,cursor:"pointer",textAlign:"left",
                }}>
                <PatternPreview patternId={p.id}/>
                <div style={{flex:1}}>
                  <div style={{
                    fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:13,
                    color:pattern===p.id?"#F0F2F8":"#9CA3AF",
                  }}>{p.label}</div>
                  <div style={{fontSize:11,color:"#4B5563",marginTop:2}}>{p.desc}</div>
                </div>
                <div style={{
                  fontFamily:"'JetBrains Mono',monospace",fontSize:14,fontWeight:600,
                  color:"#F59E0B",
                }}>{p.mult}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Payouts Reference */}
      {mode !== 2 && (
        <div style={{
          display:"flex",gap:8,
        }}>
          {MODE_PAYOUTS[mode].map((p,i)=>(
            <div key={i} style={{
              flex:1,background:"#0E1017",border:"1px solid #1E2130",
              borderRadius:8,padding:"10px 12px",
            }}>
              <div style={{fontSize:10,color:"#6B7280"}}>{p.label}</div>
              <div style={{
                fontFamily:"'JetBrains Mono',monospace",fontSize:16,
                color:"#F59E0B",fontWeight:600,marginTop:3,
              }}>{p.mult}</div>
            </div>
          ))}
        </div>
      )}

      {/* Game Visual / Result Area */}
      <div style={{
        background:"#0E1017",border:"1px solid #1E2130",
        borderRadius:14,padding:"24px 20px",
        minHeight:200,display:"flex",flexDirection:"column",
        alignItems:"center",gap:16,position:"relative",overflow:"hidden",
      }}>
        <div style={{
          position:"absolute",inset:0,
          background:"radial-gradient(ellipse at 50% 0%,rgba(37,99,235,0.06),transparent 70%)",
          pointerEvents:"none",
        }}/>

        {/* IDLE */}
        {state==="idle" && !result && (
          <>
            <div style={{
              display:"grid",
              gridTemplateColumns:`repeat(${MODES[mode].grid},1fr)`,
              gap:4,width:MODES[mode].grid===3?120:180,
            }}>
              {Array.from({length:MODES[mode].grid**2},(_,i)=>(
                <div key={i} style={{
                  aspectRatio:"1",borderRadius:5,
                  background:"#13151C",border:"1px solid #1E2130",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontFamily:"'JetBrains Mono',monospace",
                  fontSize:MODES[mode].grid===3?14:11,
                  color:"#374151",
                }}>?</div>
              ))}
            </div>
            <div style={{fontSize:11,color:"#6B7280",letterSpacing:"2px"}}>
              {MODES[mode].grid}×{MODES[mode].grid} BINGO CARD
            </div>
          </>
        )}

        {/* PENDING */}
        {busy && (
          <>
            <div style={{
              width:48,height:48,borderRadius:"50%",
              border:"3px solid #1E2130",
              borderTopColor:"#2563EB",borderRightColor:"#F59E0B",
              animation:"spin2 0.9s linear infinite",
            }}/>
            <div style={{fontSize:12,color:"#2563EB",letterSpacing:"1px"}}>
              {state==="approving"?"APPROVING USDC...":
               state==="placing"  ?"PLACING BET...":
               "DRAWING NUMBERS..."}
            </div>
            {state==="pending" && (
              <div style={{fontSize:10,color:"#374151",textAlign:"center"}}>
                Pyth Entropy is generating your card · Usually under 30s
              </div>
            )}
          </>
        )}

        {/* RESULT */}
        {state==="settled" && result && (
          <div style={{
            display:"flex",flexDirection:"column",alignItems:"center",
            gap:14,width:"100%",
          }}>
            <div style={{
              fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:24,
              color:result.won?"#10B981":"#EF4444",
            }}>
              {result.won
                ? `🎉 BINGO! +${usd(result.payout)}`
                : "😔 No Match"}
            </div>

            {/* Bingo Card */}
            <div style={{width:"100%",maxWidth:240}}>
              <BingoCard
                card={result.card}
                drawn={result.drawn}
                gridSize={result.gridSize}
                won={result.won}
              />
            </div>

            <div style={{fontSize:11,color:"#6B7280",textAlign:"center"}}>
              {result.drawn.length} numbers drawn ·{" "}
              {result.card.filter(n=>result.drawn.includes(n)).length} matched on your card
            </div>

            <button onClick={()=>{setState("idle");setResult(null);setError(null);}}
              style={{
                background:"transparent",border:"1px solid #1E2130",
                color:"#6B7280",borderRadius:8,padding:"7px 20px",
                cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:12,
              }}>
              Play Again
            </button>
          </div>
        )}

        {error && (
          <div style={{fontSize:12,color:"#EF4444",textAlign:"center",padding:"0 12px"}}>
            ⚠ {error}
          </div>
        )}
      </div>

      {/* Wager Input */}
      <div style={{
        background:"#0E1017",border:"1px solid #1E2130",
        borderRadius:12,padding:16,display:"flex",flexDirection:"column",gap:10,
      }}>
        <div style={{fontSize:10,color:"#6B7280",letterSpacing:"2px"}}>WAGER (USDC)</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{color:"#6B7280",fontSize:16}}>$</span>
          <input
            style={{
              background:"#13151C",border:"1.5px solid #1E2130",borderRadius:8,
              color:"#F0F2F8",fontFamily:"'Outfit',sans-serif",
              fontSize:18,fontWeight:600,padding:"10px 14px",width:"100%",outline:"none",
            }}
            type="number" value={wager}
            onChange={e=>setWager(e.target.value)}
            disabled={busy}
          />
        </div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {["1","5","10","25","50"].map(v=>(
            <button key={v} onClick={()=>setWager(v)} disabled={busy}
              style={{
                background:"#13151C",border:"1px solid #1E2130",borderRadius:7,
                color:"#6B7280",padding:"5px 12px",fontSize:12,
                fontFamily:"'Outfit',sans-serif",cursor:"pointer",
              }}>${v}</button>
          ))}
        </div>

        {/* Win Payout */}
        <div style={{
          display:"flex",justifyContent:"space-between",alignItems:"center",
          background:"rgba(37,99,235,.06)",border:"1px solid rgba(37,99,235,.15)",
          borderRadius:8,padding:"10px 14px",
        }}>
          <div>
            <div style={{fontSize:10,color:"#6B7280"}}>WIN PAYOUT</div>
            <div style={{
              fontFamily:"'JetBrains Mono',monospace",fontSize:16,
              color:"#00F5A0",marginTop:2,
            }}>
              ${(parseFloat(wager||0) * winMult).toFixed(2)}
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:"#6B7280"}}>MULTIPLIER</div>
            <div style={{
              fontSize:16,color:"#FFD166",fontWeight:600,marginTop:2,
            }}>{winMult}×</div>
          </div>
        </div>
      </div>

      {/* Play Button */}
      <button
        disabled={busy || !wagerF || wagerF > balF || !BINGO_ADDR}
        onClick={placeBet}
        style={{
          background: busy ? "#1D4ED8" : "#2563EB",
          color:"#fff",border:"none",borderRadius:10,
          padding:"15px",width:"100%",
          fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:15,
          cursor:busy?"not-allowed":"pointer",
          opacity:busy||!wagerF||wagerF>balF?0.7:1,
          display:"flex",alignItems:"center",justifyContent:"center",gap:8,
          transition:"all 0.15s",
        }}>
        {busy && (
          <div style={{
            width:16,height:16,borderRadius:"50%",
            border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",
            animation:"spin2 0.8s linear infinite",
          }}/>
        )}
        {btnLabel()}
      </button>

      <div style={{fontSize:10,color:"#374151",textAlign:"center"}}>
        Pyth Entropy v2 · Provably fair · 3% house edge
      </div>
    </div>
  );
}
