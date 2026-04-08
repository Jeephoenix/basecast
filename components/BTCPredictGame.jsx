"use client";
// components/BTCPredictGame.jsx — BaseCast BTC 1-Min Prediction Market

import { useState, useEffect, useRef, useCallback } from "react";
import { usePublicClient, useWalletClient, useAccount } from "wagmi";
import { parseUnits, formatUnits } from "viem";

// ── Contract ABIs ──────────────────────────────────────────────────────────────
const USDC_ABI = [
  {name:"allowance",type:"function",stateMutability:"view",   inputs:[{name:"owner",type:"address"},{name:"spender",type:"address"}],outputs:[{type:"uint256"}]},
  {name:"approve",  type:"function",stateMutability:"nonpayable",inputs:[{name:"spender",type:"address"},{name:"amount",type:"uint256"}],outputs:[{type:"bool"}]},
];

const ROUND_COMPONENTS = [
  {name:"epoch",          type:"uint256"},
  {name:"startTimestamp", type:"uint256"},
  {name:"lockTimestamp",  type:"uint256"},
  {name:"closeTimestamp", type:"uint256"},
  {name:"lockPrice",      type:"int64"},
  {name:"closePrice",     type:"int64"},
  {name:"totalAmount",    type:"uint256"},
  {name:"upAmount",       type:"uint256"},
  {name:"downAmount",     type:"uint256"},
  {name:"treasuryAmount", type:"uint256"},
  {name:"status",         type:"uint8"},
];

const BTP_ABI = [
  {name:"currentEpoch",    type:"function",stateMutability:"view",   inputs:[],                                                                outputs:[{type:"uint256"}]},
  {name:"genesisStartOnce",type:"function",stateMutability:"view",   inputs:[],                                                                outputs:[{type:"bool"}]},
  {name:"genesisLockOnce", type:"function",stateMutability:"view",   inputs:[],                                                                outputs:[{type:"bool"}]},
  {name:"minBetAmount",    type:"function",stateMutability:"view",   inputs:[],                                                                outputs:[{type:"uint256"}]},
  {name:"maxBetAmount",    type:"function",stateMutability:"view",   inputs:[],                                                                outputs:[{type:"uint256"}]},
  {name:"rounds",          type:"function",stateMutability:"view",   inputs:[{name:"epoch",type:"uint256"}],                                   outputs:[{type:"tuple",components:ROUND_COMPONENTS}]},
  {name:"betInfos",        type:"function",stateMutability:"view",   inputs:[{name:"epoch",type:"uint256"},{name:"user",type:"address"}],       outputs:[{name:"amount",type:"uint256"},{name:"isUp",type:"bool"},{name:"claimed",type:"bool"}]},
  {name:"getUserRounds",   type:"function",stateMutability:"view",   inputs:[{name:"user",type:"address"}],                                    outputs:[{type:"uint256[]"}]},
  {name:"claimable",       type:"function",stateMutability:"view",   inputs:[{name:"epoch",type:"uint256"},{name:"user",type:"address"}],       outputs:[{type:"bool"}]},
  {name:"betUp",           type:"function",stateMutability:"nonpayable",inputs:[{name:"epoch",type:"uint256"},{name:"amount",type:"uint256"}],  outputs:[]},
  {name:"betDown",         type:"function",stateMutability:"nonpayable",inputs:[{name:"epoch",type:"uint256"},{name:"amount",type:"uint256"}],  outputs:[]},
  {name:"claim",           type:"function",stateMutability:"nonpayable",inputs:[{name:"epochs",type:"uint256[]"}],                             outputs:[]},
];

// ── Constants ──────────────────────────────────────────────────────────────────
const STATUS = { Pending:0, Open:1, Locked:2, Ended:3, Cancelled:4 };
const FEE_BPS = 300n;

// ── Helpers ────────────────────────────────────────────────────────────────────
const usd6   = (v) => `$${parseFloat(formatUnits(v ?? 0n, 6)).toFixed(2)}`;
const fmtBtc = (p) => p ? `$${parseFloat(p).toLocaleString("en-US", {minimumFractionDigits:2,maximumFractionDigits:2})}` : "---";
const pct    = (a, t) => t > 0n ? Math.round(Number((a * 100n) / t)) : 50;
const mult   = (stake, pool, fee) => {
  if (!stake || stake === 0n) return "---";
  const net  = pool - (pool * FEE_BPS / 10000n);
  const m    = Number(net) / Number(stake);
  return isFinite(m) && m > 0 ? `${m.toFixed(2)}×` : "---";
};

// ── Sparkline chart ────────────────────────────────────────────────────────────
function Sparkline({ prices, lockPrice }) {
  if (prices.length < 2) return <div style={{height:72,background:"rgba(255,255,255,0.02)",borderRadius:10}}/>;
  const W = 320, H = 72;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W;
    const y = H - ((p - min) / range) * (H - 8) - 4;
    return `${x},${y}`;
  }).join(" ");
  const last = prices[prices.length - 1];
  const isUp = !lockPrice || last >= lockPrice;
  const color = isUp ? "#00F5A0" : "#FF4D6D";
  const lx = lockPrice ? ((prices.length - 1) / (prices.length - 1)) * W : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:H,display:"block"}}>
      <defs>
        <linearGradient id="sparkg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon
        points={`0,${H} ${pts} ${W},${H}`}
        fill="url(#sparkg)"
      />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lockPrice && (
        <line
          x1={lx} y1="0" x2={lx} y2={H}
          stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3,3"
        />
      )}
    </svg>
  );
}

// ── Round history dot ──────────────────────────────────────────────────────────
function HistoryDot({ round, userBet }) {
  if (!round || round.status === STATUS.Pending || round.status === STATUS.Open) return null;
  const cancelled = round.status === STATUS.Cancelled;
  const bullWon   = !cancelled && round.closePrice > round.lockPrice;
  const userWon   = userBet && userBet.amount > 0n && !cancelled && (userBet.isUp === bullWon);
  const userLost  = userBet && userBet.amount > 0n && !cancelled && !userWon;

  let bg = cancelled ? "rgba(255,255,255,0.2)" : bullWon ? "rgba(0,245,160,0.25)" : "rgba(255,77,109,0.25)";
  let border = cancelled ? "rgba(255,255,255,0.3)" : bullWon ? "#00F5A0" : "#FF4D6D";
  let icon = cancelled ? "—" : bullWon ? "▲" : "▼";
  let color = cancelled ? "var(--sub)" : bullWon ? "#00F5A0" : "#FF4D6D";

  return (
    <div title={`Round #${round.epoch} · ${cancelled ? "Cancelled" : bullWon ? "UP won" : "DOWN won"}${userWon?" · You won":userLost?" · You lost":""}`}
      style={{width:28,height:28,borderRadius:"50%",background:bg,border:`1.5px solid ${border}`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color,fontWeight:700,
              outline: userWon ? "2px solid gold" : userLost ? "2px solid rgba(255,77,109,0.4)" : "none",
              cursor:"default",flexShrink:0}}>
      {icon}
    </div>
  );
}

// ── Countdown timer ────────────────────────────────────────────────────────────
function useCountdown(targetTs) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, targetTs - Math.floor(Date.now() / 1000));
      setSecs(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetTs]);
  return secs;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function BTCPredictGame({ usdcAddress, btpAddress, balance, refetchBalance, explorer }) {
  const { address }      = useAccount();
  const pub              = usePublicClient();
  const { data: wc }     = useWalletClient();

  // Live price state
  const [btcPrice,   setBtcPrice]   = useState(null);
  const [prevPrice,  setPrevPrice]  = useState(null);
  const [priceHist,  setPriceHist]  = useState([]);   // rolling 60 ticks
  const wsRef = useRef(null);

  // Contract state
  const [epoch,       setEpoch]       = useState(0n);
  const [openRound,   setOpenRound]   = useState(null);
  const [lockedRound, setLockedRound] = useState(null);
  const [histRounds,  setHistRounds]  = useState([]);
  const [userBets,    setUserBets]    = useState({});
  const [claimEpochs, setClaimEpochs] = useState([]);
  const [started,     setStarted]     = useState(false);
  const [loading,     setLoading]     = useState(true);

  // UI state
  const [wager,   setWager]   = useState("10");
  const [choice,  setChoice]  = useState(null);  // "up" | "down"
  const [status,  setStatus]  = useState("idle"); // idle | approving | placing | done | error
  const [errMsg,  setErrMsg]  = useState(null);
  const [txHash,  setTxHash]  = useState(null);
  const [claiming,setClaiming] = useState(false);

  const busy = status === "approving" || status === "placing";

  // ── Binance WebSocket ────────────────────────────────────────────────────────
  useEffect(() => {
    let ws;
    const connect = () => {
      ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@ticker");
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          const p = parseFloat(d.c);
          if (isNaN(p)) return;
          setPrevPrice(prev => prev ?? p);
          setBtcPrice(cur => { if (cur) setPrevPrice(cur); return p; });
          setPriceHist(h => {
            const next = [...h, p];
            return next.length > 80 ? next.slice(-80) : next;
          });
        } catch {}
      };
      ws.onerror = () => setTimeout(connect, 3000);
      ws.onclose = () => setTimeout(connect, 3000);
    };
    connect();
    return () => { try { ws?.close(); } catch {} };
  }, []);

  // ── Read contract state ──────────────────────────────────────────────────────
  const fetchState = useCallback(async () => {
    if (!pub || !btpAddress || !address) return;
    try {
      const [isStarted, currentEpoch] = await Promise.all([
        pub.readContract({address:btpAddress, abi:BTP_ABI, functionName:"genesisStartOnce"}),
        pub.readContract({address:btpAddress, abi:BTP_ABI, functionName:"currentEpoch"}),
      ]);
      setStarted(isStarted);
      setEpoch(currentEpoch);

      if (!isStarted || currentEpoch === 0n) { setLoading(false); return; }

      // Fetch open + locked + history rounds
      const histCount = 8n;
      const epochs = [];
      for (let i = currentEpoch; i >= 1n && i >= currentEpoch - histCount; i--) {
        epochs.push(i);
      }

      const roundData = await Promise.all(
        epochs.map(ep => pub.readContract({address:btpAddress, abi:BTP_ABI, functionName:"rounds", args:[ep]}))
      );
      const betsData = await Promise.all(
        epochs.map(ep => pub.readContract({address:btpAddress, abi:BTP_ABI, functionName:"betInfos", args:[ep, address]}))
      );

      const roundMap = {};
      const betMap   = {};
      epochs.forEach((ep, i) => {
        roundMap[ep.toString()] = roundData[i];
        betMap[ep.toString()]   = { amount: betsData[i][0], isUp: betsData[i][1], claimed: betsData[i][2] };
      });

      setOpenRound(roundMap[currentEpoch.toString()]);
      setLockedRound(currentEpoch > 1n ? roundMap[(currentEpoch - 1n).toString()] : null);
      setHistRounds(
        epochs.slice(2).map(ep => ({round: roundMap[ep.toString()], bet: betMap[ep.toString()], ep}))
      );
      setUserBets(betMap);

      // Find claimable rounds
      const claimable = [];
      for (const ep of epochs) {
        const r = roundMap[ep.toString()];
        const b = betMap[ep.toString()];
        if (b.amount > 0n && !b.claimed) {
          const s = r.status;
          if (s === STATUS.Cancelled) { claimable.push(ep); continue; }
          if (s === STATUS.Ended) {
            const bullWon = r.closePrice > r.lockPrice;
            if (b.isUp === bullWon) claimable.push(ep);
          }
        }
      }
      setClaimEpochs(claimable);
    } catch (e) {
      console.error("BTCPredict fetchState:", e);
    } finally {
      setLoading(false);
    }
  }, [pub, btpAddress, address]);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 15_000);
    return () => clearInterval(id);
  }, [fetchState]);

  // ── Countdown ────────────────────────────────────────────────────────────────
  const lockTs   = openRound   ? Number(openRound.lockTimestamp)   : 0;
  const closeTs  = lockedRound ? Number(lockedRound.closeTimestamp) : 0;
  const openSecs = useCountdown(lockTs);
  const lockSecs = useCountdown(closeTs);

  // ── Betting ──────────────────────────────────────────────────────────────────
  const doBet = async (isUp) => {
    if (!wc || !pub || !btpAddress || !usdcAddress || !epoch) return;
    const amt = parseUnits(wager || "0", 6);
    if (amt === 0n) return;

    setStatus("approving");
    setErrMsg(null);
    setTxHash(null);
    setChoice(isUp ? "up" : "down");

    try {
      const allowance = await pub.readContract({
        address: usdcAddress, abi: USDC_ABI, functionName: "allowance",
        args: [address, btpAddress],
      });
      if (allowance < amt) {
        const appHash = await wc.writeContract({
          address: usdcAddress, abi: USDC_ABI, functionName: "approve",
          args: [btpAddress, amt],
        });
        await pub.waitForTransactionReceipt({hash: appHash});
      }

      setStatus("placing");
      const hash = await wc.writeContract({
        address: btpAddress, abi: BTP_ABI,
        functionName: isUp ? "betUp" : "betDown",
        args: [epoch, amt],
      });
      await pub.waitForTransactionReceipt({hash});
      setTxHash(hash);
      setStatus("done");
      await fetchState();
      await refetchBalance?.();
    } catch (e) {
      const msg = e?.shortMessage || e?.message || "Transaction failed";
      setErrMsg(msg.includes("user rejected") || msg.includes("User denied") ? "Cancelled." : msg);
      setStatus("error");
    }
  };

  const doClaim = async () => {
    if (!wc || !pub || !btpAddress || claimEpochs.length === 0) return;
    setClaiming(true);
    try {
      const hash = await wc.writeContract({
        address: btpAddress, abi: BTP_ABI,
        functionName: "claim",
        args: [claimEpochs],
      });
      await pub.waitForTransactionReceipt({hash});
      await fetchState();
      await refetchBalance?.();
    } catch (e) {
      console.error("Claim error:", e);
    } finally {
      setClaiming(false);
    }
  };

  // ── Derived values ───────────────────────────────────────────────────────────
  const openTotal    = openRound?.totalAmount ?? 0n;
  const openUp       = openRound?.upAmount    ?? 0n;
  const openDown     = openRound?.downAmount  ?? 0n;
  const upPct        = pct(openUp, openTotal);
  const downPct      = 100 - upPct;
  const upMult       = mult(openUp,   openTotal, FEE_BPS);
  const downMult     = mult(openDown, openTotal, FEE_BPS);
  const userBetOpen  = userBets[epoch?.toString()];
  const hasOpenBet   = userBetOpen && userBetOpen.amount > 0n;
  const lockPrice    = lockedRound ? Number(lockedRound.lockPrice) / 1e8 : null;
  const priceUp      = btcPrice && prevPrice ? btcPrice >= prevPrice : null;
  const bettingOpen  = openRound?.status === STATUS.Open && openSecs > 0;

  // ── Not deployed ─────────────────────────────────────────────────────────────
  if (!btpAddress) {
    return (
      <div className="fi card" style={{textAlign:"center",padding:"48px 24px"}}>
        <div style={{fontSize:32,marginBottom:12}}>📡</div>
        <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>BTC Predict not deployed</div>
        <div style={{fontSize:13,color:"var(--sub)"}}>
          Deploy the <code>BTCPredict</code> contract and set <code>NEXT_PUBLIC_BTC_PREDICT_ADDRESS</code>.
        </div>
      </div>
    );
  }

  // ── Not started ──────────────────────────────────────────────────────────────
  if (!loading && (!started || epoch === 0n)) {
    return (
      <div className="fi card" style={{textAlign:"center",padding:"48px 24px"}}>
        <div style={{fontSize:32,marginBottom:12}}>⏳</div>
        <div style={{fontWeight:700,fontSize:16,marginBottom:8}}>Rounds not started yet</div>
        <div style={{fontSize:13,color:"var(--sub)"}}>The keeper will start the first round shortly.</div>
      </div>
    );
  }

  return (
    <div className="fi" style={{display:"flex",flexDirection:"column",gap:12}}>

      {/* ── Claimable banner ── */}
      {claimEpochs.length > 0 && (
        <div style={{background:"rgba(0,245,160,0.08)",border:"1px solid rgba(0,245,160,0.3)",
                     borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",
                     justifyContent:"space-between",gap:12}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:"#00F5A0"}}>
              🎉 You have {claimEpochs.length} winning round{claimEpochs.length>1?"s":""}!
            </div>
            <div style={{fontSize:11,color:"var(--sub)",marginTop:2}}>Tap collect to receive your USDC</div>
          </div>
          <button onClick={doClaim} disabled={claiming}
            style={{background:"#00F5A0",color:"#07050f",border:"none",borderRadius:10,padding:"8px 16px",
                    fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,opacity:claiming?.6:1}}>
            {claiming ? "..." : "Collect"}
          </button>
        </div>
      )}

      {/* ── Live BTC price card ── */}
      <div className="card" style={{padding:"16px 18px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 0%,rgba(0,245,160,0.05),transparent 70%)",pointerEvents:"none"}}/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,borderRadius:8,background:"#F0B90B",display:"flex",alignItems:"center",
                         justifyContent:"center",fontSize:14,fontWeight:900,color:"#000"}}>₿</div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"var(--tx)"}}>BTC / USD</div>
              <div style={{fontSize:9,color:"var(--sub)",letterSpacing:"1px"}}>BINANCE LIVE</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:"#00F5A0",animation:"glowPulse 1.5s ease infinite"}}/>
            <span style={{fontSize:10,color:"#00F5A0",fontWeight:600}}>LIVE</span>
          </div>
        </div>

        <div style={{display:"flex",alignItems:"flex-end",gap:10,marginBottom:12}}>
          <div style={{fontSize:30,fontWeight:700,color:priceUp===null?"var(--tx)":priceUp?"#00F5A0":"#FF4D6D",
                       fontFamily:"'JetBrains Mono',monospace",letterSpacing:"-1px",transition:"color .3s"}}>
            {fmtBtc(btcPrice)}
          </div>
          {lockPrice && (
            <div style={{fontSize:11,color:"var(--sub)",marginBottom:4,paddingBottom:2}}>
              lock ${lockPrice.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
            </div>
          )}
        </div>

        <Sparkline prices={priceHist} lockPrice={null}/>
      </div>

      {/* ── Round history dots ── */}
      {histRounds.length > 0 && (
        <div style={{display:"flex",gap:6,alignItems:"center",padding:"0 4px",overflowX:"auto"}}>
          <span style={{fontSize:10,color:"var(--sub)",flexShrink:0,marginRight:2}}>History</span>
          {[...histRounds].reverse().map(({round,bet,ep}) => (
            <HistoryDot key={ep.toString()} round={round} userBet={bet}/>
          ))}
        </div>
      )}

      {/* ── Locked round countdown ── */}
      {lockedRound && lockedRound.status === STATUS.Locked && (
        <div className="card" style={{padding:"12px 16px",background:"rgba(108,99,255,0.06)",border:"1px solid rgba(108,99,255,0.2)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:40,height:40,borderRadius:"50%",border:"2px solid var(--blue)",
                           display:"flex",alignItems:"center",justifyContent:"center",
                           fontSize:14,fontWeight:700,color:"var(--blue)",fontFamily:"'JetBrains Mono',monospace"}}>
                {lockSecs}
              </div>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:"var(--blue)"}}/>
                  <span style={{fontSize:11,fontWeight:700,color:"var(--blue)"}}>LOCKED</span>
                  <span style={{fontSize:10,color:"var(--sub)"}}>Round #{lockedRound.epoch?.toString()}</span>
                </div>
                <div style={{fontSize:11,color:"var(--sub)",marginTop:2}}>
                  Lock ${(Number(lockedRound.lockPrice ?? 0n) / 1e8).toLocaleString("en-US",{minimumFractionDigits:2})}
                  &nbsp;· Pool {usd6(lockedRound.totalAmount)}
                </div>
              </div>
            </div>
            {userBets[(lockedRound.epoch ?? 0n).toString()]?.amount > 0n && (
              <div style={{fontSize:10,color:"var(--blue)",background:"rgba(108,99,255,0.15)",
                           padding:"3px 8px",borderRadius:6,border:"1px solid rgba(108,99,255,0.25)"}}>
                {userBets[(lockedRound.epoch ?? 0n).toString()].isUp ? "▲ UP" : "▼ DOWN"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Open round info ── */}
      <div className="card" style={{padding:"14px 16px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:48,height:48,borderRadius:"50%",background:"var(--s2)",
                         border:"2px solid var(--bd)",display:"flex",alignItems:"center",
                         justifyContent:"center",position:"relative"}}>
              <svg viewBox="0 0 36 36" width="44" height="44" style={{position:"absolute"}}>
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--bd)" strokeWidth="2.5"/>
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--blue)" strokeWidth="2.5"
                  strokeDasharray={`${(openSecs/60)*100} 100`}
                  strokeLinecap="round"
                  transform="rotate(-90 18 18)"
                  style={{transition:"stroke-dasharray 1s linear"}}/>
              </svg>
              <span style={{fontSize:12,fontWeight:700,color:"var(--tx)",zIndex:1}}>{openSecs}</span>
            </div>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:"#00F5A0"}}/>
                <span style={{fontSize:11,fontWeight:700,color:"#00F5A0"}}>OPEN</span>
                <span style={{fontSize:10,color:"var(--sub)"}}>Round #{epoch?.toString()}</span>
              </div>
              <div style={{fontSize:11,color:"var(--sub)",marginTop:2}}>
                {bettingOpen
                  ? openSecs <= 10
                    ? `⚠ Bet closes in ${openSecs}s`
                    : `Entry ${usd6(openTotal)} pooled`
                  : "Betting closed"}
              </div>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:"var(--sub)"}}>POOL</div>
            <div style={{fontSize:14,fontWeight:700,color:"var(--tx)"}}>{usd6(openTotal)}</div>
          </div>
        </div>

        {/* Split bar */}
        <div style={{display:"flex",gap:8,alignItems:"stretch"}}>
          <div style={{flex:1,background:"rgba(0,245,160,0.1)",border:"1px solid rgba(0,245,160,0.2)",
                       borderRadius:10,padding:"10px 12px"}}>
            <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
              <span style={{fontSize:9,color:"#00F5A0"}}>▲</span>
              <span style={{fontSize:10,color:"var(--sub)",fontWeight:600}}>UP</span>
            </div>
            <div style={{fontSize:13,fontWeight:700,color:"#00F5A0"}}>{usd6(openUp)}</div>
            <div style={{fontSize:10,color:"var(--sub)",marginTop:2}}>{upMult} payout</div>
          </div>

          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"6px 0"}}>
            <span style={{fontSize:9,color:"var(--sub)",letterSpacing:"1px"}}>SPLIT</span>
            <div style={{width:10,flex:1,borderRadius:5,background:"var(--bd)",overflow:"hidden",display:"flex",flexDirection:"column"}}>
              <div style={{flex:upPct,background:"#00F5A0",transition:"flex .5s"}}/>
              <div style={{flex:downPct,background:"#FF4D6D",transition:"flex .5s"}}/>
            </div>
            <span style={{fontSize:9,color:"var(--sub)"}}>{upPct}%</span>
          </div>

          <div style={{flex:1,background:"rgba(255,77,109,0.08)",border:"1px solid rgba(255,77,109,0.2)",
                       borderRadius:10,padding:"10px 12px",textAlign:"right"}}>
            <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end",marginBottom:4}}>
              <span style={{fontSize:10,color:"var(--sub)",fontWeight:600}}>DOWN</span>
              <span style={{fontSize:9,color:"#FF4D6D"}}>▼</span>
            </div>
            <div style={{fontSize:13,fontWeight:700,color:"#FF4D6D"}}>{usd6(openDown)}</div>
            <div style={{fontSize:10,color:"var(--sub)",marginTop:2}}>{downMult} payout</div>
          </div>
        </div>
      </div>

      {/* ── Betting UI ── */}
      {hasOpenBet ? (
        <div className="card" style={{textAlign:"center",padding:"20px 16px",background:"rgba(108,99,255,0.06)",border:"1px solid rgba(108,99,255,0.2)"}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--blue)",marginBottom:6}}>
            You're in Round #{epoch?.toString()} — {userBetOpen.isUp ? "▲ UP" : "▼ DOWN"}
          </div>
          <div style={{fontSize:12,color:"var(--sub)"}}>
            Bet: <strong style={{color:"var(--tx)"}}>{usd6(userBetOpen.amount)}</strong>
          </div>
          <div style={{fontSize:11,color:"var(--dim)",marginTop:6}}>Results appear when the round ends</div>
        </div>
      ) : (
        <>
          {/* Choice buttons */}
          <div style={{display:"flex",gap:8}}>
            <button
              onClick={() => { if (!busy) { setChoice("up"); } }}
              disabled={busy || !bettingOpen}
              style={{flex:1,padding:"18px 12px",borderRadius:12,border:`2px solid ${choice==="up"?"#00F5A0":"rgba(0,245,160,0.25)"}`,
                      background:choice==="up"?"rgba(0,245,160,0.15)":"rgba(0,245,160,0.05)",
                      color:choice==="up"?"#00F5A0":"rgba(0,245,160,0.6)",cursor:"pointer",
                      display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                      transition:"all .15s",opacity:bettingOpen?1:0.4}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 4l8 8H4z"/>
              </svg>
              <span style={{fontWeight:700,fontSize:14,fontFamily:"'Inter',sans-serif"}}>UP</span>
              <span style={{fontSize:10,opacity:0.7}}>{upMult} payout</span>
            </button>

            <button
              onClick={() => { if (!busy) { setChoice("down"); } }}
              disabled={busy || !bettingOpen}
              style={{flex:1,padding:"18px 12px",borderRadius:12,border:`2px solid ${choice==="down"?"#FF4D6D":"rgba(255,77,109,0.25)"}`,
                      background:choice==="down"?"rgba(255,77,109,0.12)":"rgba(255,77,109,0.04)",
                      color:choice==="down"?"#FF4D6D":"rgba(255,77,109,0.6)",cursor:"pointer",
                      display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                      transition:"all .15s",opacity:bettingOpen?1:0.4}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 20L4 12h16z"/>
              </svg>
              <span style={{fontWeight:700,fontSize:14,fontFamily:"'Inter',sans-serif"}}>DOWN</span>
              <span style={{fontSize:10,opacity:0.7}}>{downMult} payout</span>
            </button>
          </div>

          {/* Wager input */}
          <div className="card" style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{fontSize:10,color:"var(--sub)",letterSpacing:"2px"}}>WAGER (CREDITS)</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{color:"var(--sub)",fontSize:16}}>$</span>
              <input className="inp" type="number" min="0.5" step="0.5"
                value={wager} onChange={e=>setWager(e.target.value)} disabled={busy}/>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {["5","10","25","50","100"].map(v=>(
                <button key={v} onClick={()=>setWager(v)} disabled={busy}
                  style={{background:wager===v?"rgba(108,99,255,0.25)":"var(--s2)",
                          border:`1px solid ${wager===v?"var(--blue)":"var(--bd)"}`,
                          color:wager===v?"var(--blue)":"var(--sub)",
                          padding:"5px 12px",fontSize:12,borderRadius:7,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
                  ${v}
                </button>
              ))}
            </div>
          </div>

          {/* Submit button */}
          {status === "done" ? (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{background:"rgba(0,245,160,0.08)",border:"1px solid rgba(0,245,160,0.3)",
                           borderRadius:12,padding:"14px",textAlign:"center"}}>
                <div style={{fontSize:13,fontWeight:700,color:"#00F5A0"}}>Bet placed! ✓</div>
                <div style={{fontSize:11,color:"var(--sub)",marginTop:4}}>
                  {txHash && <a href={`${explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                    style={{color:"var(--blue)"}}>View on Explorer ↗</a>}
                </div>
              </div>
            </div>
          ) : (
            <button
              disabled={busy || !choice || !parseFloat(wager) || !bettingOpen}
              onClick={() => doBet(choice === "up")}
              style={{width:"100%",padding:"15px",borderRadius:12,border:"none",cursor:"pointer",
                      fontSize:15,fontWeight:700,fontFamily:"'Inter',sans-serif",
                      background: !choice ? "var(--s2)" :
                        choice==="up" ? "linear-gradient(135deg,#00F5A0,#00c97c)" :
                                        "linear-gradient(135deg,#FF4D6D,#c0392b)",
                      color: !choice ? "var(--sub)" : choice==="up" ? "#07050f" : "#fff",
                      opacity: (busy || !choice || !parseFloat(wager) || !bettingOpen) ? 0.45 : 1,
                      display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                      transition:"all .15s",boxShadow: choice==="up" ? "0 4px 20px rgba(0,245,160,0.3)" :
                                                       choice==="down" ? "0 4px 20px rgba(255,77,109,0.3)" : "none"}}>
              {busy ? (
                <>
                  <div style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",
                               borderTopColor:"#fff",animation:"spin2 .8s linear infinite"}}/>
                  {status === "approving" ? "Approving USDC..." : "Placing bet..."}
                </>
              ) : !bettingOpen ? (
                "⏸ Betting closed"
              ) : !choice ? (
                "Pick UP or DOWN"
              ) : (
                `${choice==="up"?"▲ PREDICT UP":"▼ PREDICT DOWN"} · $${parseFloat(wager||0).toFixed(2)}`
              )}
            </button>
          )}
        </>
      )}

      {errMsg && (
        <div style={{background:"rgba(255,77,109,0.08)",border:"1px solid rgba(255,77,109,0.25)",
                     borderRadius:10,padding:"12px 14px",fontSize:12,color:"#FF4D6D"}}>
          ⚠ {errMsg}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{fontSize:10,color:"var(--dim)",textAlign:"center"}}>
        price data via Binance · settlement via Pyth Price Feed
      </div>
    </div>
  );
}
