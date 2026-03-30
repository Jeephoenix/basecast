"use client";
// components/BingoGame.jsx

import { useState, useCallback, useEffect, useRef } from "react";
import { usePublicClient, useWalletClient, useAccount } from "wagmi";
import { parseUnits, formatUnits } from "viem";

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

// ── Constants ─────────────────────────────────────────────────────────────────
const usd = (v) => `$${parseFloat(formatUnits(v||0n,6)).toFixed(2)}`;

function ordinal(n) {
  const s = ["th","st","nd","rd"];
  const v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

const MODES = [
  { id:0, key:"TURBO",   label:"⚡ Turbo",   grid:3, desc:"3×3 · Fastest · Any line wins" },
  { id:1, key:"SPEED",   label:"🚀 Speed",   grid:5, desc:"5×5 · First line or full card"  },
  { id:2, key:"PATTERN", label:"🎯 Pattern", grid:5, desc:"5×5 · Choose your pattern"      },
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

// ── Win detection (mirrors contract logic) ─────────────────────────────────────
function getWinLines(gridSize) {
  const g = gridSize;
  const lines = [];
  for (let r=0;r<g;r++) { const row=[]; for(let c=0;c<g;c++) row.push(r*g+c); lines.push(row); }
  for (let c=0;c<g;c++) { const col=[]; for(let r=0;r<g;r++) col.push(r*g+c); lines.push(col); }
  const d1=[],d2=[]; for(let i=0;i<g;i++){d1.push(i*g+i);d2.push(i*g+(g-1-i));} lines.push(d1,d2);
  return lines;
}

function checkWin(card, revealedDrawnSet, mode, pattern, gridSize) {
  const matched = new Set(card.map((n,i)=>(revealedDrawnSet.has(n)?i:-1)).filter(i=>i>=0));

  if (mode === 0) {
    return getWinLines(3).some(line => line.every(i => matched.has(i)));
  }
  if (mode === 1) {
    return getWinLines(5).some(line => line.every(i => matched.has(i))) || matched.size === 25;
  }
  if (mode === 2) {
    if (pattern === 0) return getWinLines(5).some(line => line.every(i => matched.has(i)));
    if (pattern === 1) {
      const d1=[0,6,12,18,24], d2=[4,8,12,16,20];
      return d1.every(i=>matched.has(i)) && d2.every(i=>matched.has(i));
    }
    if (pattern === 2) return [0,4,20,24].every(i=>matched.has(i));
    if (pattern === 3) {
      const top=[0,1,2,3,4], midCol=[2,7,12,17,22];
      return top.every(i=>matched.has(i)) && midCol.every(i=>matched.has(i));
    }
    if (pattern === 4) return matched.size === 25;
  }
  return false;
}

function getWinningCells(card, revealedDrawnSet, mode, pattern) {
  const matched = new Set(card.map((n,i)=>(revealedDrawnSet.has(n)?i:-1)).filter(i=>i>=0));
  const winCells = new Set();
  if (mode === 0) {
    getWinLines(3).forEach(line => { if(line.every(i=>matched.has(i))) line.forEach(i=>winCells.add(i)); });
  } else if (mode === 1) {
    getWinLines(5).forEach(line => { if(line.every(i=>matched.has(i))) line.forEach(i=>winCells.add(i)); });
    if (matched.size===25) matched.forEach(i=>winCells.add(i));
  } else if (mode === 2) {
    if (pattern===0) getWinLines(5).forEach(line => { if(line.every(i=>matched.has(i))) line.forEach(i=>winCells.add(i)); });
    if (pattern===1) { [0,6,12,18,24,4,8,12,16,20].forEach(i=>winCells.add(i)); }
    if (pattern===2) [0,4,20,24].forEach(i=>winCells.add(i));
    if (pattern===3) [0,1,2,3,4,2,7,12,17,22].forEach(i=>winCells.add(i));
    if (pattern===4) matched.forEach(i=>winCells.add(i));
  }
  return winCells;
}

// ── Sound effects ─────────────────────────────────────────────────────────────
function playRevealTick(matched) {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = matched ? "sine" : "triangle";
    osc.frequency.setValueAtTime(matched ? 520 : 220, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (matched ? 0.25 : 0.12));
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {}
}

function playWin() {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    [523,659,784,1047,1319].forEach((freq,i) => {
      const osc=ctx.createOscillator(), gain=ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type="sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime+i*0.1);
      gain.gain.setValueAtTime(0.28, ctx.currentTime+i*0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+i*0.1+0.4);
      osc.start(ctx.currentTime+i*0.1);
      osc.stop(ctx.currentTime+i*0.1+0.4);
    });
  } catch {}
}

// ── Confetti burst ────────────────────────────────────────────────────────────
function ConfettiBurst() {
  const particles = Array.from({length:28},(_,i)=>i);
  return (
    <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden",zIndex:10}}>
      {particles.map(i=>{
        const angle = (i/particles.length)*360;
        const dist  = 60 + Math.random()*80;
        const size  = 6 + Math.random()*6;
        const colors= ["#2563EB","#F59E0B","#10B981","#EF4444","#8B5CF6","#EC4899","#06B6D4"];
        const color = colors[i % colors.length];
        const delay = (Math.random()*0.3).toFixed(2);
        const dur   = (0.6+Math.random()*0.5).toFixed(2);
        const tx    = Math.cos(angle*Math.PI/180)*dist;
        const ty    = Math.sin(angle*Math.PI/180)*dist;
        return (
          <div key={i} style={{
            position:"absolute",
            left:"50%", top:"40%",
            width:size, height:size,
            borderRadius: i%3===0 ? "50%" : 2,
            background: color,
            animation: `confetti-fly ${dur}s ${delay}s ease-out forwards`,
            "--tx": `${tx}px`,
            "--ty": `${ty}px`,
          }}/>
        );
      })}
      <style>{`
        @keyframes confetti-fly {
          0%   { transform: translate(-50%,-50%) scale(1); opacity:1; }
          100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0.3) rotate(360deg); opacity:0; }
        }
      `}</style>
    </div>
  );
}

// ── Pattern preview ───────────────────────────────────────────────────────────
function PatternPreview({ patternId, size=5 }) {
  const highlights = {
    0: [0,1,2,3,4],
    1: [0,6,12,18,24,4,8,16,20],
    2: [0,4,20,24],
    3: [0,1,2,3,4,2,7,12,17,22],
    4: Array.from({length:25},(_,i)=>i),
  };
  const hi = new Set(highlights[patternId]||[]);
  return (
    <div style={{display:"grid",gridTemplateColumns:`repeat(${size},1fr)`,gap:2,width:60,height:60}}>
      {Array.from({length:size*size},(_,i)=>(
        <div key={i} style={{borderRadius:2,background:hi.has(i)?"#2563EB":"#1E2130"}}/>
      ))}
    </div>
  );
}

// ── Bingo Card ────────────────────────────────────────────────────────────────
function BingoCard({ card, revealedSet, winCells, gridSize, phase, justRevealedNum }) {
  if (!card || card.length === 0) return null;

  return (
    <div style={{
      display:"grid",
      gridTemplateColumns:`repeat(${gridSize},1fr)`,
      gap:5, width:"100%",
    }}>
      {card.map((num, i) => {
        const isRevealed  = revealedSet.has(Number(num));
        const isWinCell   = winCells && winCells.has(i);
        const isJustHit   = justRevealedNum === Number(num) && isRevealed;

        let bg     = "#13151C";
        let border = "1.5px solid #1E2130";
        let color  = "#374151";
        let shadow = "none";
        let scale  = "1";

        if (isWinCell) {
          bg     = "rgba(16,185,129,0.18)";
          border = "1.5px solid #10B981";
          color  = "#10B981";
          shadow = "0 0 12px rgba(16,185,129,0.45)";
        } else if (isJustHit) {
          bg     = "rgba(37,99,235,0.35)";
          border = "1.5px solid #60A5FA";
          color  = "#BFDBFE";
          shadow = "0 0 14px rgba(37,99,235,0.7)";
          scale  = "1.12";
        } else if (isRevealed) {
          bg     = "rgba(37,99,235,0.18)";
          border = "1.5px solid #2563EB";
          color  = "#93C5FD";
          shadow = "0 0 6px rgba(37,99,235,0.3)";
        }

        return (
          <div key={i} style={{
            aspectRatio:"1",
            borderRadius:7,
            display:"flex",alignItems:"center",justifyContent:"center",
            fontFamily:"'JetBrains Mono',monospace",
            fontSize: gridSize===3 ? 17 : 12,
            fontWeight:600,
            background: bg,
            border: border,
            color: color,
            boxShadow: shadow,
            transform: `scale(${scale})`,
            transition:"all 0.25s ease",
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
  const { address }  = useAccount();
  const pub          = usePublicClient();
  const { data: wc } = useWalletClient();

  const [mode,        setMode]        = useState(0);
  const [pattern,     setPattern]     = useState(0);
  const [wager,       setWager]       = useState("1");
  const [phase,       setPhase]       = useState("idle");
  // idle | approving | placing | pending | revealing | won | lost
  const [result,      setResult]      = useState(null);
  const [revealIndex, setRevealIndex] = useState(0);
  const [winCells,    setWinCells]    = useState(null);
  const [justRevealed,setJustRevealed]= useState(null);
  const [showConfetti,setShowConfetti]= useState(false);
  const [error,       setError]       = useState(null);
  const justRevealedTimer = useRef(null);

  const revealedSet = result
    ? new Set(result.drawn.slice(0, revealIndex).map(Number))
    : new Set();

  // ── Allowance ───────────────────────────────────────────────────────────────
  const ensureAllow = async (amt) => {
    const al = await pub.readContract({
      address:USDC_ADDR, abi:USDC_ABI,
      functionName:"allowance", args:[address, VAULT_ADDR],
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

  // ── Poll for on-chain result ─────────────────────────────────────────────────
  const pollResult = (seqNum, fromBlock) => {
    let i = 0;
    const iv = setInterval(async () => {
      if (++i > 90) {
        clearInterval(iv);
        setError("Timeout — bet is safe, check history");
        setPhase("idle");
        return;
      }
      try {
        const bet = await pub.readContract({
          address:BINGO_ADDR, abi:BINGO_ABI,
          functionName:"getBet", args:[seqNum],
        });
        if (bet.status !== 0) {
          clearInterval(iv);
          const logs = await pub.getLogs({
            address:BINGO_ADDR,
            event: BINGO_ABI.find(x=>x.name==="BingoResult"),
            args:  { seqNum },
            fromBlock: fromBlock,
          });
          let card=[], drawn=[];
          if (logs[0]?.args) {
            card  = logs[0].args.card        || [];
            drawn = logs[0].args.drawnNumbers|| [];
          }
          setResult({
            won:     bet.status===1,
            payout:  bet.payout,
            wager:   bet.wager,
            mode:    bet.mode,
            pattern: bet.pattern,
            card:    card.map(Number),
            drawn:   drawn.map(Number),
            gridSize:bet.gridSize,
          });
          setRevealIndex(0);
          setWinCells(null);
          setJustRevealed(null);
          setPhase("revealing");
          refetchBalance?.();
        }
      } catch {}
    }, 2500);
  };

  // ── Place bet ────────────────────────────────────────────────────────────────
  const placeBet = useCallback(async () => {
    if (!address || !wc || !BINGO_ADDR) return;
    setError(null); setResult(null); setRevealIndex(0); setWinCells(null);
    try {
      const w = parseUnits(wager, 6);
      setPhase("approving");
      await ensureAllow(w);

      const fee = await pub.readContract({
        address:BINGO_ADDR, abi:BINGO_ABI, functionName:"getEntropyFee",
      });
      setPhase("placing");

      let req;
      if (mode===0) {
        const {request} = await pub.simulateContract({
          address:BINGO_ADDR, abi:BINGO_ABI, functionName:"placeTurbo",
          args:[w], value:fee, account:address,
        });
        req = request;
      } else if (mode===1) {
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

      setPhase("pending");
      if (seq !== null) pollResult(seq, receipt.blockNumber);
    } catch(e) {
      setError(e.shortMessage || e.message || "Transaction failed");
      setPhase("idle");
    }
  }, [address, wc, pub, wager, mode, pattern]);

  // ── Reveal one number ────────────────────────────────────────────────────────
  const revealNext = useCallback(() => {
    if (!result || phase !== "revealing") return;
    const nextIndex = revealIndex + 1;
    const newNum    = result.drawn[revealIndex];

    setJustRevealed(Number(newNum));
    clearTimeout(justRevealedTimer.current);
    justRevealedTimer.current = setTimeout(() => setJustRevealed(null), 600);

    const newRevealed = new Set(result.drawn.slice(0, nextIndex).map(Number));
    const isMatch     = result.card.includes(Number(newNum));
    playRevealTick(isMatch);

    setRevealIndex(nextIndex);

    // Only decide win/loss after ALL drawn numbers have been revealed
    if (nextIndex >= result.drawn.length) {
      const won = checkWin(result.card, newRevealed, result.mode, result.pattern, result.gridSize);
      if (won) {
        const cells = getWinningCells(result.card, newRevealed, result.mode, result.pattern);
        setWinCells(cells);
        setPhase("won");
        setShowConfetti(true);
        playWin();
        setTimeout(() => setShowConfetti(false), 2200);
      } else {
        setPhase("lost");
      }
    }
  }, [result, phase, revealIndex]);

  const reset = () => {
    setPhase("idle");
    setResult(null);
    setRevealIndex(0);
    setWinCells(null);
    setJustRevealed(null);
    setError(null);
  };

  const busy  = ["approving","placing","pending"].includes(phase);
  const balF  = parseFloat(formatUnits(balance||0n, 6));
  const wagerF= parseFloat(wager||0);

  const btnLabel = () => {
    if (phase==="approving") return "Approving USDC...";
    if (phase==="placing")   return "Placing bet...";
    if (phase==="pending")   return "Drawing numbers...";
    const mLabel = ["PLAY TURBO","PLAY SPEED","PLAY PATTERN"][mode];
    return `${mLabel} · $${wager}`;
  };

  const totalDrawn   = result?.drawn?.length ?? 0;
  const revealLeft   = totalDrawn - revealIndex;
  const revealLabel  = revealLeft > 0
    ? `Reveal ${ordinal(revealIndex+1)} number`
    : null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {phase==="idle" && (
        <div style={{display:"flex",gap:8}}>
          {MODES.map(m=>(
            <button key={m.id}
              onClick={()=>{setMode(m.id);reset();}}
              style={{
                flex:1,padding:"12px 8px",border:"none",borderRadius:10,
                cursor:"pointer",transition:"all 0.15s",
                fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:12,
                background: mode===m.id ? "#2563EB" : "#13151C",
                color:       mode===m.id ? "#fff"     : "#6B7280",
                outline: mode===m.id ? "2px solid rgba(37,99,235,0.4)" : "none",
              }}>
              <div>{m.label}</div>
              <div style={{fontSize:9,fontWeight:400,marginTop:3,
                color:mode===m.id?"rgba(255,255,255,0.7)":"#374151"}}>{m.desc}</div>
            </button>
          ))}
        </div>
      )}

      {mode === 2 && phase==="idle" && (
        <div style={{
          background:"#0E1017",border:"1px solid #1E2130",
          borderRadius:12,padding:14,display:"flex",flexDirection:"column",gap:10,
        }}>
          <div style={{fontSize:10,color:"#6B7280",letterSpacing:"2px"}}>CHOOSE PATTERN</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {PATTERNS.map(p=>(
              <button key={p.id}
                onClick={()=>setPattern(p.id)}
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

      {mode !== 2 && phase==="idle" && (
        <div style={{display:"flex",gap:8}}>
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

      <div style={{
        background:"#0E1017",border:"1px solid #1E2130",
        borderRadius:14,padding:"24px 20px",
        minHeight:220,display:"flex",flexDirection:"column",
        alignItems:"center",gap:16,position:"relative",overflow:"hidden",
      }}>
        <div style={{
          position:"absolute",inset:0,
          background:"radial-gradient(ellipse at 50% 0%,rgba(37,99,235,0.06),transparent 70%)",
          pointerEvents:"none",
        }}/>

        {showConfetti && <ConfettiBurst/>}

        {phase==="idle" && (
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

        {busy && (
          <>
            <div style={{
              width:48,height:48,borderRadius:"50%",
              border:"3px solid #1E2130",
              borderTopColor:"#2563EB",borderRightColor:"#F59E0B",
              animation:"spin2 0.9s linear infinite",
            }}/>
            <div style={{fontSize:12,color:"#2563EB",letterSpacing:"1px"}}>
              {phase==="approving"?"APPROVING USDC...":
               phase==="placing"  ?"PLACING BET...":
               "DRAWING NUMBERS..."}
            </div>
            {phase==="pending" && (
              <div style={{fontSize:10,color:"#374151",textAlign:"center"}}>
                Pyth Entropy is generating your card · Usually under 30s
              </div>
            )}
          </>
        )}

        {phase==="revealing" && result && (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,width:"100%"}}>
            <div style={{width:"100%",display:"flex",flexDirection:"column",gap:6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:10,color:"#6B7280",letterSpacing:"2px"}}>YOUR CARD</div>
                <div style={{
                  fontSize:11,color:"#4B5563",
                  fontFamily:"'JetBrains Mono',monospace",
                }}>
                  {revealIndex} / {totalDrawn} drawn
                </div>
              </div>
              <div style={{
                width:"100%",height:3,background:"#13151C",borderRadius:2,overflow:"hidden",
              }}>
                <div style={{
                  height:"100%",borderRadius:2,
                  background:"linear-gradient(90deg,#2563EB,#60A5FA)",
                  width:`${(revealIndex/totalDrawn)*100}%`,
                  transition:"width 0.3s ease",
                }}/>
              </div>
            </div>

            <div style={{width:"100%",maxWidth:result.gridSize===3?180:240}}>
              <BingoCard
                card={result.card}
                revealedSet={revealedSet}
                winCells={null}
                gridSize={result.gridSize}
                phase={phase}
                justRevealedNum={justRevealed}
              />
            </div>

            <button
              onClick={revealNext}
              style={{
                background:"linear-gradient(135deg,#1D4ED8,#2563EB)",
                color:"#fff",border:"none",borderRadius:10,
                padding:"13px 28px",width:"100%",maxWidth:280,
                fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:14,
                cursor:"pointer",letterSpacing:"0.5px",
                boxShadow:"0 4px 16px rgba(37,99,235,0.4)",
                transition:"all 0.15s",
              }}
              onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"}
              onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}
            >
              🎱 {revealLabel}
            </button>
          </div>
        )}

        {phase==="won" && result && (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,width:"100%"}}>
            <div style={{
              fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:26,
              color:"#10B981",textAlign:"center",
              animation:"pulse-win 0.6s ease-in-out",
            }}>
              🎉 BINGO!
            </div>
            <div style={{
              fontFamily:"'JetBrains Mono',monospace",fontSize:18,
              color:"#F59E0B",fontWeight:600,
            }}>
              +{usd(result.payout)}
            </div>

            <div style={{width:"100%",maxWidth:result.gridSize===3?180:240}}>
              <BingoCard
                card={result.card}
                revealedSet={revealedSet}
                winCells={winCells}
                gridSize={result.gridSize}
                phase={phase}
                justRevealedNum={null}
              />
            </div>

            <div style={{fontSize:11,color:"#6B7280",textAlign:"center"}}>
              {revealIndex} of {totalDrawn} numbers revealed ·{" "}
              {result.card.filter(n=>revealedSet.has(n)).length} matched
            </div>

            <button onClick={reset} style={{
              background:"rgba(16,185,129,0.12)",border:"1px solid #10B981",
              color:"#10B981",borderRadius:8,padding:"8px 22px",
              cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:12,
            }}>
              Play Again
            </button>
          </div>
        )}

        {phase==="lost" && result && (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,width:"100%"}}>
            <div style={{
              fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:22,
              color:"#EF4444",
            }}>
              😔 No Match
            </div>

            <div style={{width:"100%",maxWidth:result.gridSize===3?180:240}}>
              <BingoCard
                card={result.card}
                revealedSet={revealedSet}
                winCells={null}
                gridSize={result.gridSize}
                phase={phase}
                justRevealedNum={null}
              />
            </div>

            <div style={{fontSize:11,color:"#6B7280",textAlign:"center"}}>
              All {totalDrawn} numbers drawn ·{" "}
              {result.card.filter(n=>revealedSet.has(n)).length} matched on your card
            </div>

            <button onClick={reset} style={{
              background:"transparent",border:"1px solid #1E2130",
              color:"#6B7280",borderRadius:8,padding:"7px 20px",
              cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:12,
            }}>
              Try Again
            </button>
          </div>
        )}

        {error && (
          <div style={{fontSize:12,color:"#EF4444",textAlign:"center",padding:"0 12px"}}>
            ⚠ {error}
          </div>
        )}
      </div>

      {phase==="idle" && (
        <>
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
              />
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {["1","5","10","25","50"].map(v=>(
                <button key={v} onClick={()=>setWager(v)}
                  style={{
                    background:"#13151C",border:"1px solid #1E2130",borderRadius:7,
                    color:"#6B7280",padding:"5px 12px",fontSize:12,
                    fontFamily:"'Outfit',sans-serif",cursor:"pointer",
                  }}>${v}</button>
              ))}
            </div>
          </div>

          <button
            disabled={busy || !wagerF || wagerF > balF || !BINGO_ADDR}
            onClick={placeBet}
            style={{
              background:"#2563EB",color:"#fff",border:"none",borderRadius:10,
              padding:"15px",width:"100%",
              fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:15,
              cursor:"pointer",
              opacity:(!wagerF||wagerF>balF)?0.7:1,
              transition:"all 0.15s",
            }}>
            {btnLabel()}
          </button>
        </>
      )}

      {busy && (
        <button disabled style={{
          background:"#1D4ED8",color:"#fff",border:"none",borderRadius:10,
          padding:"15px",width:"100%",
          fontFamily:"'Outfit',sans-serif",fontWeight:600,fontSize:15,
          cursor:"not-allowed",opacity:0.7,
          display:"flex",alignItems:"center",justifyContent:"center",gap:8,
        }}>
          <div style={{
            width:16,height:16,borderRadius:"50%",
            border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",
            animation:"spin2 0.8s linear infinite",
          }}/>
          {btnLabel()}
        </button>
      )}

      <style>{`
        @keyframes pulse-win {
          0%   { transform: scale(0.8); opacity:0.5; }
          60%  { transform: scale(1.08); }
          100% { transform: scale(1); opacity:1; }
        }
      `}</style>

      <div style={{fontSize:10,color:"#374151",textAlign:"center"}}>
        Pyth Entropy v2 · Provably fair · 3% house edge
      </div>
    </div>
  );
}
