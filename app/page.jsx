"use client";
// app/page.jsx — BaseCast v2

import { AppFooter, ConsentModal, hasConsented } from "@/components/PolicyModal";
import BingoGame from "@/components/BingoGame";
import { useState, useEffect, useCallback } from "react";
import {
  useAccount, useChainId, useSwitchChain,
  usePublicClient, useWalletClient,
  useSignMessage,
} from "wagmi";
import { ConnectButton }                      from "@rainbow-me/rainbowkit";
import { parseUnits, formatUnits } from "viem";

// ── Addresses ─────────────────────────────────────────────────────────────────
const VAULT    = process.env.NEXT_PUBLIC_VAULT_ADDRESS;
const COINFLIP = process.env.NEXT_PUBLIC_COINFLIP_ADDRESS;
const DICEROLL = process.env.NEXT_PUBLIC_DICEROLL_ADDRESS;
const BINGO    = process.env.NEXT_PUBLIC_BINGO_ADDRESS;
const USDC     = process.env.NEXT_PUBLIC_USDC_ADDRESS;
const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "84532");
const EXPLORER = CHAIN_ID === 8453 ? "https://basescan.org" : "https://sepolia.basescan.org";
const PYTH_CHAIN    = CHAIN_ID === 8453 ? "base" : "base-sepolia";
const PYTH_EXPLORER = `https://entropy-explorer.pyth.network/?chain=${PYTH_CHAIN}`;

// ── ABIs ──────────────────────────────────────────────────────────────────────
const USDC_ABI = [
  {name:"balanceOf", type:"function", stateMutability:"view",       inputs:[{name:"a",type:"address"}],                                outputs:[{type:"uint256"}]},
  {name:"allowance", type:"function", stateMutability:"view",       inputs:[{name:"o",type:"address"},{name:"s",type:"address"}],      outputs:[{type:"uint256"}]},
  {name:"approve",   type:"function", stateMutability:"nonpayable", inputs:[{name:"s",type:"address"},{name:"a",type:"uint256"}],      outputs:[{type:"bool"}]},
];
const VAULT_ABI = [
  {name:"vaultBalance",            type:"function", stateMutability:"view", inputs:[], outputs:[{type:"uint256"}]},
  {name:"maxBet",                  type:"function", stateMutability:"view", inputs:[], outputs:[{type:"uint256"}]},
  {name:"minBet",                  type:"function", stateMutability:"view", inputs:[], outputs:[{type:"uint256"}]},
  {name:"getLeaderboardAddresses", type:"function", stateMutability:"view", inputs:[], outputs:[{type:"address[]"}]},
  {name:"getMultipleStats",        type:"function", stateMutability:"view",
    inputs:[{name:"players",type:"address[]"}],
    outputs:[{name:"volumes",type:"uint128[]"},{name:"pnls",type:"int128[]"}]},
];
const CF_ABI = [
  {name:"placeBet",      type:"function", stateMutability:"payable",
    inputs:[{name:"wager",type:"uint256"},{name:"choice",type:"uint8"}],
    outputs:[{name:"seqNum",type:"uint64"}]},
  {name:"getBet",        type:"function", stateMutability:"view",
    inputs:[{name:"seqNum",type:"uint64"}],
    outputs:[{name:"",type:"tuple",components:[
      {name:"player",type:"address"},{name:"wager",type:"uint96"},
      {name:"choice",type:"uint8"},{name:"status",type:"uint8"},
      {name:"payout",type:"uint96"},{name:"timestamp",type:"uint32"},
      {name:"randomSeed",type:"bytes32"},
    ]}]},
  {name:"getEntropyFee", type:"function", stateMutability:"view", inputs:[], outputs:[{type:"uint128"}]},
  {name:"getPlayerBets", type:"function", stateMutability:"view",
    inputs:[{name:"player",type:"address"}], outputs:[{type:"uint64[]"}]},
];
const DR_ABI = [
  {name:"placeBetRange", type:"function", stateMutability:"payable",
    inputs:[{name:"wager",type:"uint256"},{name:"high",type:"bool"}],
    outputs:[{name:"seqNum",type:"uint64"}]},
  {name:"placeBetExact", type:"function", stateMutability:"payable",
    inputs:[{name:"wager",type:"uint256"},{name:"number",type:"uint8"}],
    outputs:[{name:"seqNum",type:"uint64"}]},
  {name:"getBet",        type:"function", stateMutability:"view",
    inputs:[{name:"seqNum",type:"uint64"}],
    outputs:[{name:"",type:"tuple",components:[
      {name:"player",type:"address"},{name:"wager",type:"uint96"},
      {name:"betType",type:"uint8"},{name:"exactNumber",type:"uint8"},
      {name:"status",type:"uint8"},{name:"rolledNumber",type:"uint8"},
      {name:"payout",type:"uint96"},{name:"timestamp",type:"uint32"},
      {name:"randomSeed",type:"bytes32"},
    ]}]},
  {name:"getEntropyFee", type:"function", stateMutability:"view", inputs:[], outputs:[{type:"uint128"}]},
  {name:"getPlayerBets", type:"function", stateMutability:"view",
    inputs:[{name:"player",type:"address"}], outputs:[{type:"uint64[]"}]},
];
const BG_ABI = [
  {name:"getBet", type:"function", stateMutability:"view",
    inputs:[{name:"seqNum",type:"uint64"}],
    outputs:[{name:"",type:"tuple",components:[
      {name:"player",type:"address"},{name:"wager",type:"uint96"},
      {name:"mode",type:"uint8"},{name:"pattern",type:"uint8"},
      {name:"status",type:"uint8"},{name:"payout",type:"uint96"},
      {name:"timestamp",type:"uint32"},{name:"randomSeed",type:"bytes32"},
      {name:"gridSize",type:"uint8"},
    ]}]},
  {name:"getPlayerBets", type:"function", stateMutability:"view",
    inputs:[{name:"player",type:"address"}], outputs:[{type:"uint64[]"}]},
];

const BET_RESOLVED_EVENT = {name:"BetResolved",type:"event",inputs:[
  {name:"seqNum",type:"uint64",indexed:true},
  {name:"player",type:"address",indexed:true},
  {name:"wager",type:"uint256",indexed:false},
  {name:"payout",type:"uint256",indexed:false},
  {name:"won",type:"bool",indexed:false},
]};

// ── Helpers ───────────────────────────────────────────────────────────────────
const usd  = (v) => `$${parseFloat(formatUnits(v||0n,6)).toFixed(2)}`;
const pnl  = (v) => `${v<0n?"-":"+"}$${parseFloat(formatUnits(v<0n?-v:v,6)).toFixed(2)}`;
function playWin() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
      gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.35);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.35);
    });
  } catch {}
}

function playLose() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {}
}

// ── Session auth helpers ──────────────────────────────────────────────────────
const SESSION_KEY = "bc_session";
function getSession(addr) {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY)||"{}");
    if (s.address !== addr || Date.now()-s.ts > 86400000) return null;
    return s;
  } catch { return null; }
}
function saveSession(addr, sig) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({address:addr,sig,ts:Date.now()}));
}

// ── Dice dots ─────────────────────────────────────────────────────────────────
const DOTS = {
  1:[[50,50]], 2:[[28,28],[72,72]], 3:[[28,28],[50,50],[72,72]],
  4:[[28,28],[72,28],[28,72],[72,72]],
  5:[[28,28],[72,28],[50,50],[28,72],[72,72]],
  6:[[28,28],[72,28],[28,50],[72,50],[28,72],[72,72]],
};

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Orbitron:wght@900&family=Courgette&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07050f;--s1:rgba(255,255,255,0.04);--s2:rgba(255,255,255,0.07);--bd:rgba(255,255,255,0.1);
  --blue:#6C63FF;--blue2:#4F46E5;--green:#00F5A0;--red:#FF4D6D;
  --gold:#FFD166;--tx:#F0F2FF;--sub:#9094B0;--dim:#3D4060;
}
.light{--bg:#F0F4FF;--s1:rgba(255,255,255,0.85);--s2:rgba(240,244,255,0.9);--bd:rgba(0,0,0,0.1);--tx:#0A0B1A;--sub:#5560A0;--dim:#9AA5CC;--blue:#4338CA;--blue2:#3730A3;--green:#059669;--gold:#D97706;--red:#DC2626}
body{background:linear-gradient(125deg,#07050f 0%,#120a2e 30%,#0a1628 60%,#07050f 100%);background-attachment:fixed;color:var(--tx);font-family:'Outfit',sans-serif;min-height:100vh}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#6C63FF,#00F5A0);border-radius:4px}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin2{to{transform:rotate(360deg)}}
@keyframes flip{0%{transform:rotateY(0)}50%{transform:rotateY(900deg) scale(1.2)}100%{transform:rotateY(1800deg)}}
@keyframes roll{0%{transform:rotate(0)}40%{transform:rotate(360deg) scale(1.1)}100%{transform:rotate(720deg)}}
@keyframes winPop{0%,100%{box-shadow:none}50%{box-shadow:0 0 28px rgba(16,185,129,0.5)}}
@keyframes loseShk{0%,100%{transform:translateX(0)}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
@keyframes signPulse{0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,0.4)}50%{box-shadow:0 0 0 10px rgba(37,99,235,0)}}
.fi{animation:fadeIn .3s ease}
.flip{animation:flip 1.4s cubic-bezier(.4,0,.2,1) forwards}
.roll{animation:roll 1.2s cubic-bezier(.4,0,.2,1) forwards}
.win{animation:winPop .8s ease}
.lose{animation:loseShk .4s ease}
.sp{animation:spin2 .8s linear infinite}
.spulse{animation:signPulse 2s ease infinite}
.btn{border:none;border-radius:10px;cursor:pointer;font-family:'Outfit',sans-serif;font-weight:600;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:8px}
.primary{background:linear-gradient(135deg,#6C63FF,#4F46E5);color:#fff;padding:14px;width:100%;font-size:15px;box-shadow:0 4px 20px rgba(108,99,255,0.35)}
.primary:hover:not(:disabled){background:linear-gradient(135deg,#7C74FF,#6C63FF);transform:translateY(-2px);box-shadow:0 6px 28px rgba(108,99,255,0.5)}
.primary:disabled{opacity:.4;cursor:not-allowed}
.choice{background:var(--s2);border:1.5px solid var(--bd);color:var(--sub);padding:14px;flex:1;font-size:14px}
.choice.sel{border-color:var(--blue);background:rgba(108,99,255,.28);color:var(--tx);box-shadow:inset 0 0 0 1px rgba(108,99,255,.25)}
.choice:hover:not(:disabled){border-color:var(--blue);color:var(--tx)}
.inp{background:var(--s2);border:1.5px solid var(--bd);border-radius:10px;color:var(--tx);font-family:'Outfit',sans-serif;font-size:18px;font-weight:600;padding:12px 16px;width:100%;outline:none}
.inp:focus{border-color:var(--blue)}
.card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:20px;backdrop-filter:blur(20px);box-shadow:0 8px 32px rgba(0,0,0,0.4)}
.tab{background:none;border:none;border-bottom:2px solid transparent;font-family:'Outfit',sans-serif;font-size:14px;font-weight:500;padding:12px 20px;cursor:pointer;color:var(--sub);transition:all .15s}
.tab.on{color:var(--tx);border-bottom-color:var(--blue)}
.mono{font-family:'JetBrains Mono',monospace}
@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
.shimmer{background:linear-gradient(90deg,#00F5A0,#a8ff78,#FFD166,#00D4AA,#00F5A0);background-size:300%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shimmer 2.5s linear infinite;font-weight:700}
.nav-bar{display:flex;background:var(--s1);border-bottom:1px solid var(--bd)}
.nav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 8px;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;color:var(--sub);font-family:'Outfit',sans-serif;font-size:12px;font-weight:500;transition:all .15s;outline:none}
.nav-item.active{color:var(--blue);border-bottom-color:var(--blue)}
.nav-item:hover:not(.active){color:var(--tx)}
.game-card-btn{width:100%;display:flex;align-items:center;gap:14px;padding:14px 16px;border:1px solid var(--bd);border-radius:12px;margin-bottom:8px;background:var(--s2);cursor:pointer;text-align:left;color:var(--tx);transition:border-color .15s,background .15s;font-family:'Outfit',sans-serif}
.game-card-btn:hover{border-color:var(--blue);background:rgba(108,99,255,.1)}
.gametab{background:none;border:none;border-bottom:2px solid transparent;font-family:'Outfit',sans-serif;font-size:13px;font-weight:500;padding:10px 16px;cursor:pointer;color:var(--sub);transition:all .15s;white-space:nowrap}
.gametab.on{color:var(--tx);border-bottom-color:var(--blue)}
@media(max-width:520px){
  .hdr{padding:10px 12px!important}
  .hdr-logo{font-size:13px!important}
  .hdr-right{gap:6px!important}
  .stats-bar>div{padding:6px 10px!important}
  .main-pad{padding:14px 10px 90px!important}
  .card{padding:14px!important;border-radius:14px!important}
  .primary{padding:12px!important;font-size:14px!important}
  .choice{padding:11px!important;font-size:13px!important}
  .inp{font-size:16px!important;padding:10px 13px!important}
  .nav-bar{position:fixed;bottom:0;left:0;right:0;z-index:50;border-top:1px solid var(--bd);border-bottom:none;padding-bottom:env(safe-area-inset-bottom,0)}
  .nav-item{padding:8px 4px 6px;font-size:10px}
  .top-stats-bar{display:none!important}
}
@media(min-width:521px){
  .main-content-wrap{max-width:680px!important}
}
`;

// ── Sub-components ────────────────────────────────────────────────────────────
const Spin = ({size=16}) => (
  <div className="sp" style={{width:size,height:size,borderRadius:"50%",border:`2px solid var(--bd)`,borderTopColor:"#2563EB",borderRightColor:"#F59E0B",flexShrink:0}}/>
);

const Coin = ({side="HEADS",anim=false}) => (
  <div className={anim?"flip":""} style={{
    width:72,height:72,borderRadius:"50%",flexShrink:0,userSelect:"none",
    background:side==="HEADS"?"linear-gradient(135deg,#D97706,#92400E)":"linear-gradient(135deg,#6B7280,#374151)",
    display:"flex",alignItems:"center",justifyContent:"center",
    fontSize:24,fontFamily:"'JetBrains Mono',monospace",color:"rgba(0,0,0,.5)",
    boxShadow:side==="HEADS"?"0 4px 16px rgba(217,119,6,.3)":"0 4px 16px rgba(107,114,128,.2)",
  }}>{side==="HEADS"?"H":"T"}</div>
);

const Die = ({n=1,size=64,anim=false}) => (
  <div className={anim?"roll":""} style={{
    width:size,height:size,background:"var(--s2)",
    border:"1.5px solid var(--bd)",borderRadius:size*.16,
    position:"relative",flexShrink:0,
  }}>
    {(DOTS[n]||[]).map(([x,y],i)=>(
      <div key={i} style={{
        position:"absolute",width:size*.15,height:size*.15,
        borderRadius:"50%",background:"var(--blue)",
        left:`${x}%`,top:`${y}%`,transform:"translate(-50%,-50%)",
      }}/>
    ))}
  </div>
);

const QuickBtns = ({set}) => (
  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
    {["1","5","10","25","50"].map(v=>(
      <button key={v} className="btn" style={{background:"var(--s2)",border:"1px solid var(--bd)",color:"var(--sub)",padding:"5px 12px",fontSize:12,borderRadius:7,width:"auto"}}
        onClick={()=>set(v)}>${v}</button>
    ))}
  </div>
);

const PayInfo = ({wager,mult}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(37,99,235,.06)",border:"1px solid rgba(37,99,235,.15)",borderRadius:8,padding:"10px 14px"}}>
    <div>
      <div style={{fontSize:10,color:"var(--sub)"}}>WIN PAYOUT</div>
      <div className="mono" style={{fontSize:16,color:"var(--green)",marginTop:2}}>${(parseFloat(wager||0)*mult).toFixed(2)}</div>
    </div>
    <div style={{textAlign:"right"}}>
      <div style={{fontSize:10,color:"var(--sub)"}}>MULTIPLIER</div>
      <div style={{fontSize:16,color:"var(--gold)",fontWeight:600,marginTop:2}}>{mult}×</div>
    </div>
  </div>
);

// ── Sign-in screen ────────────────────────────────────────────────────────────
function SignScreen({isSigning,error,onSign}) {
  return (
    <div className="card fi" style={{textAlign:"center",padding:"40px 24px",display:"flex",flexDirection:"column",alignItems:"center",gap:20}}>
      <img src="/logo.png" width={100} height={100} style={{borderRadius:18}} onError={e=>e.target.style.display="none"}/>
      <div>
        <div style={{fontWeight:700,fontSize:20,marginBottom:8}}>One more step</div>
        <div style={{color:"var(--sub)",fontSize:13,lineHeight:1.7}}>
          Sign a message to verify wallet ownership.<br/>
          <b style={{color:"var(--tx)"}}>Free — no gas required.</b>
        </div>
      </div>
      <div style={{background:"rgba(37,99,235,.07)",border:"1px solid rgba(37,99,235,.2)",borderRadius:10,padding:"14px 16px",width:"100%",textAlign:"left"}}>
        <div style={{fontSize:10,color:"var(--blue)",letterSpacing:"2px",marginBottom:8}}>YOU&#39;RE SIGNING</div>
        <div className="mono" style={{fontSize:11,color:"var(--sub)",lineHeight:1.8}}>
          Welcome to BaseCast!<br/>
          Verify wallet ownership<br/>
          <span style={{color:"var(--dim)"}}>No gas · No transaction · Free</span>
        </div>
      </div>
      {error && <div style={{fontSize:12,color:"var(--red)",textAlign:"center"}}>⚠ {error}</div>}
      <button className="btn primary spulse" style={{fontSize:15}} onClick={onSign} disabled={isSigning}>
        {isSigning ? <><Spin/>Waiting...</> : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{display:"inline",verticalAlign:"middle",marginRight:7,flexShrink:0}}><path d="M12 22c0-4 0-7-4-9" strokeLinecap="round"/><path d="M12 22c0-4 0-7 4-9" strokeLinecap="round"/><path d="M8 9a4 4 0 0 1 8 0c0 5-1 8-2 11" strokeLinecap="round"/><path d="M6 10.5A6 6 0 0 1 18 9" strokeLinecap="round"/><path d="M4.5 12A7.5 7.5 0 0 1 12 4.5a7.5 7.5 0 0 1 7.5 7.5" strokeLinecap="round"/></svg>Sign to Enter</>}
      </button>
      <div style={{fontSize:10,color:"var(--dim)"}}>Session valid 24 hours</div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function App() {
  const {address,isConnected}     = useAccount();
  const chainId                   = useChainId();
  const {switchChain}             = useSwitchChain();
  const pub                       = usePublicClient();
  const {data:wc}                 = useWalletClient();
  const {signMessageAsync}        = useSignMessage();

  const [authed,  setAuthed]  = useState(false);
  const [signing, setSigning] = useState(false);
  const [signErr, setSignErr] = useState(null);
  const [navSection, setNavSection] = useState("home");
  const [tab, setTab] = useState("coinflip");
  const [gamesOpen, setGamesOpen] = useState(false);
  const [verifySeq,     setVerifySeq]     = useState("");
  const [verifyResult,  setVerifyResult]  = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyErr,     setVerifyErr]     = useState(null);
  const [bal,   setBal]   = useState(0n);
  const [vault, setVault] = useState({b:0n,max:0n,min:0n});
  const [cfChoice,setCfChoice] = useState("HEADS");
  const [cfWager, setCfWager]  = useState("10");
  const [cfS,     setCfS]      = useState("idle");
  const [cfRes,   setCfRes]    = useState(null);
  const [cfCoin,  setCfCoin]   = useState("HEADS");
  const [cfErr,   setCfErr]    = useState(null);
  const [dMode,  setDMode]  = useState("range");
  const [dHigh,  setDHigh]  = useState(true);
  const [dExact, setDExact] = useState(1);
  const [dWager, setDWager] = useState("10");
  const [dS,     setDS]     = useState("idle");
  const [dRes,   setDRes]   = useState(null);
  const [dNum,   setDNum]   = useState(1);
  const [dErr,   setDErr]   = useState(null);
  const [lb,    setLb]    = useState([]);
  const [lbSrt, setLbSrt] = useState("volume");
  const [lbLd,  setLbLd]  = useState(false);
  const [light, setLight] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [myPnl,   setMyPnl]   = useState(null);
  const [copied,    setCopied]    = useState(false);
  const [txHistory, setTxHistory] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txExpanded, setTxExpanded] = useState(false);

  useEffect(() => {
    if (address && getSession(address)) setAuthed(true);
    else setAuthed(false);
  }, [address]);

  const fetchMyPnl = useCallback(async () => {
    if (!pub || !VAULT || !address) return;
    try {
      const [,pnls] = await pub.readContract({address:VAULT,abi:VAULT_ABI,functionName:"getMultipleStats",args:[[address]]});
      setMyPnl(pnls[0]);
    } catch {}
  }, [pub, address]);

  useEffect(() => { if (authed) fetchMyPnl(); }, [authed, fetchMyPnl]);


  const BINGO_MODE_LABELS = ["Turbo","Speed","Pattern","Multiplayer"];

  const fetchTxHistory = useCallback(async () => {
    if (!pub || !COINFLIP || !DICEROLL || !address) return;
    setTxLoading(true);
    try {
      const fetches = [
        pub.readContract({address:COINFLIP, abi:CF_ABI, functionName:"getPlayerBets", args:[address]}),
        pub.readContract({address:DICEROLL, abi:DR_ABI, functionName:"getPlayerBets", args:[address]}),
      ];
      if (BINGO) fetches.push(pub.readContract({address:BINGO, abi:BG_ABI, functionName:"getPlayerBets", args:[address]}));

      const [cfSeqs, drSeqs, bgSeqs = []] = await Promise.all(fetches);

      const cfLast = [...cfSeqs].slice(-15);
      const drLast = [...drSeqs].slice(-15);
      const bgLast = [...bgSeqs].slice(-15);

      const [cfBets, drBets, bgBets] = await Promise.all([
        Promise.all(cfLast.map(seq => pub.readContract({address:COINFLIP, abi:CF_ABI, functionName:"getBet", args:[seq]}))),
        Promise.all(drLast.map(seq => pub.readContract({address:DICEROLL, abi:DR_ABI, functionName:"getBet", args:[seq]}))),
        BINGO ? Promise.all(bgLast.map(seq => pub.readContract({address:BINGO, abi:BG_ABI, functionName:"getBet", args:[seq]}))) : Promise.resolve([]),
      ]);

      const all = [
        ...cfBets.map((bet,i) => ({
          id:`cf-${cfLast[i]}`, type:"coinflip",
          wager:bet.wager, payout:bet.payout,
          status:Number(bet.status), timestamp:Number(bet.timestamp),
          won:Number(bet.status)===1,
          txHash: localStorage.getItem(`txhash:cf-${cfLast[i]}`) || undefined,
          seqNum: cfLast[i].toString(),
        })),
        ...drBets.map((bet,i) => ({
          id:`dr-${drLast[i]}`, type:"diceroll",
          wager:bet.wager, payout:bet.payout,
          status:Number(bet.status), timestamp:Number(bet.timestamp),
          won:Number(bet.status)===1,
          txHash: localStorage.getItem(`txhash:dr-${drLast[i]}`) || undefined,
          seqNum: drLast[i].toString(),
        })),
        ...bgBets.map((bet,i) => ({
          id:`bg-${bgLast[i]}`, type:"bingo",
          wager:bet.wager, payout:bet.payout,
          status:Number(bet.status), timestamp:Number(bet.timestamp),
          won:Number(bet.status)===1,
          subLabel: BINGO_MODE_LABELS[Number(bet.mode)] || "Bingo",
          txHash: localStorage.getItem(`txhash:bg-${bgLast[i]}`) || undefined,
          seqNum: bgLast[i].toString(),
        })),
      ].filter(tx=>tx.status!==0).sort((a,b)=>b.timestamp-a.timestamp).slice(0,30);

      setTxHistory(all);
    } catch {}
    setTxLoading(false);
  }, [pub, address]);

  useEffect(() => { if (navSection==="profile" && authed) fetchTxHistory(); }, [navSection, authed, fetchTxHistory]);

  function shortAddr(addr) {
    if (!addr) return "";
    return addr.slice(0,6) + "..." + addr.slice(-4);
  }

  function groupByDate(txs) {
    const groups = {};
    txs.forEach(tx => {
      const key = new Date(tx.timestamp*1000).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
      if (!groups[key]) groups[key] = [];
      groups[key].push(tx);
    });
    return Object.entries(groups);
  }

  function copyAddress() {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const doSign = async () => {
    setSigning(true); setSignErr(null);
    try {
      const msg = `Welcome to BaseCast!\n\nVerify wallet ownership.\nNo gas · No transaction · Free.\n\nWallet: ${address}\nNonce: ${Date.now()}`;
      const sig = await signMessageAsync({message:msg});
      saveSession(address, sig);
      setAuthed(true);
    } catch(e) {
      setSignErr(e.shortMessage||"Signature rejected. Try again.");
    }
    setSigning(false);
  };

  const fetchStats = useCallback(async () => {
    if (!pub || !USDC || !VAULT) return;
    try {
      const [b,vb,mx,mn] = await Promise.all([
        address ? pub.readContract({address:USDC,  abi:USDC_ABI,  functionName:"balanceOf", args:[address]}) : 0n,
        pub.readContract({address:VAULT, abi:VAULT_ABI, functionName:"vaultBalance"}),
        pub.readContract({address:VAULT, abi:VAULT_ABI, functionName:"maxBet"}),
        pub.readContract({address:VAULT, abi:VAULT_ABI, functionName:"minBet"}),
      ]);
      setBal(b); setVault({b:vb,max:mx,min:mn});
    } catch {}
  },[pub,address]);

  useEffect(()=>{ fetchStats(); },[fetchStats]);

  const fetchLb = useCallback(async () => {
    if (!pub || !VAULT) return;
    setLbLd(true);
    try {
      const addrs = await pub.readContract({address:VAULT,abi:VAULT_ABI,functionName:"getLeaderboardAddresses"});
      if (!addrs.length) { setLb([]); setLbLd(false); return; }
      const [vols,pnls] = await pub.readContract({
        address:VAULT,abi:VAULT_ABI,functionName:"getMultipleStats",args:[addrs]
      });
      setLb(addrs.map((a,i)=>({address:a,volume:vols[i],pnl:pnls[i]})));
    } catch {}
    setLbLd(false);
  },[pub]);

  useEffect(()=>{ if(navSection==="profile") fetchLb(); },[navSection,fetchLb]);

  const ensureAllow = async (amt) => {
    const al = await pub.readContract({address:USDC,abi:USDC_ABI,functionName:"allowance",args:[address,VAULT]});
    if (al >= amt) return;
    const {request} = await pub.simulateContract({address:USDC,abi:USDC_ABI,functionName:"approve",args:[VAULT,amt*1000n],account:address});
    const h = await wc.writeContract(request);
    await pub.waitForTransactionReceipt({hash:h});
  };

  const pollBet = (seqNum, addr, abi, cb) => {
    let i=0;
    const iv = setInterval(async()=>{
      if(++i>60){clearInterval(iv);return;}
      try {
        const bet = await pub.readContract({address:addr,abi,functionName:"getBet",args:[seqNum]});
        if(bet.status!==0){clearInterval(iv);cb(bet);fetchStats();}
      }catch{}
    },2000);
  };

  const doFlip = async () => {
    if (!hasConsented()) { setShowConsent(true); return; }
    setCfErr(null); setCfRes(null);
    try {
      const w = parseUnits(cfWager,6);
      if (vault.max > 0n && w > vault.max) { setCfErr(`Bet too high — max bet is ${usd(vault.max)}`); return; }
      if (vault.min > 0n && w < vault.min) { setCfErr(`Bet too low — min bet is ${usd(vault.min)}`); return; }
      setCfS("approving"); await ensureAllow(w);
      const fee = await pub.readContract({address:COINFLIP,abi:CF_ABI,functionName:"getEntropyFee"});
      setCfS("placing");
      const {request} = await pub.simulateContract({
        address:COINFLIP,abi:CF_ABI,functionName:"placeBet",
        args:[w, cfChoice==="HEADS"?0:1],
        value:fee, account:address,
      });
      const hash = await wc.writeContract(request);
      const rx   = await pub.waitForTransactionReceipt({hash});
      const seq  = rx.logs.at(-1)?.topics?.[1] ? BigInt(rx.logs.at(-1).topics[1]) : null;
      if(seq!==null) localStorage.setItem(`txhash:cf-${seq}`, hash);
      setCfS("pending");
      if(seq!==null) pollBet(seq,COINFLIP,CF_ABI,(bet)=>{
        const won = bet.status===1;
        const res = (parseInt(bet.randomSeed.slice(-2),16)&1)===0?"HEADS":"TAILS";
        won ? playWin() : playLose();
        setCfCoin(res);
        setCfRes({won,payout:bet.payout,wager:bet.wager,result:res,hash});
        setCfS("settled");
      });
    } catch(e){
      setCfErr(e.shortMessage||e.message||"Failed");
      setCfS("idle");
    }
  };

  const doDice = async () => {
    if (!hasConsented()) { setShowConsent(true); return; }
    setDErr(null); setDRes(null);
    try {
      const w = parseUnits(dWager,6);
      if (vault.max > 0n && w > vault.max) { setDErr(`Bet too high — max bet is ${usd(vault.max)}`); return; }
      if (vault.min > 0n && w < vault.min) { setDErr(`Bet too low — min bet is ${usd(vault.min)}`); return; }
      setDS("approving"); await ensureAllow(w);
      const fee = await pub.readContract({address:DICEROLL,abi:DR_ABI,functionName:"getEntropyFee"});
      setDS("placing");
      let req;
      if(dMode==="range"){
        const {request} = await pub.simulateContract({address:DICEROLL,abi:DR_ABI,functionName:"placeBetRange",args:[w,dHigh],value:fee,account:address});
        req=request;
      } else {
        const {request} = await pub.simulateContract({address:DICEROLL,abi:DR_ABI,functionName:"placeBetExact",args:[w,dExact],value:fee,account:address});
        req=request;
      }
      const hash = await wc.writeContract(req);
      const rx   = await pub.waitForTransactionReceipt({hash});
      const seq  = rx.logs.at(-1)?.topics?.[1] ? BigInt(rx.logs.at(-1).topics[1]) : null;
      if(seq!==null) localStorage.setItem(`txhash:dr-${seq}`, hash);
      setDS("pending");
      if(seq!==null) pollBet(seq,DICEROLL,DR_ABI,(bet)=>{
        const won = bet.status===1;
        const rolled = Number(bet.rolledNumber);
        won ? playWin() : playLose();
        setDNum(rolled);
        setDRes({won,payout:bet.payout,wager:bet.wager,rolled,hash});
        setDS("settled");
      });
    } catch(e){
      setDErr(e.shortMessage||e.message||"Failed");
      setDS("idle");
    }
  };

  const busy = s => ["approving","placing","pending"].includes(s);

  const doVerify = async () => {
    if (!pub || !verifySeq.trim()) return;
    setVerifyLoading(true); setVerifyResult(null); setVerifyErr(null);
    try {
      const seq = BigInt(verifySeq.trim());
      let bet = null, gameType = null, contractAddr = null;
      try {
        const b = await pub.readContract({address:COINFLIP,abi:CF_ABI,functionName:"getBet",args:[seq]});
        if (b.player !== "0x0000000000000000000000000000000000000000") { bet=b; gameType="coinflip"; contractAddr=COINFLIP; }
      } catch {}
      if (!bet) {
        try {
          const b = await pub.readContract({address:DICEROLL,abi:DR_ABI,functionName:"getBet",args:[seq]});
          if (b.player !== "0x0000000000000000000000000000000000000000") { bet=b; gameType="diceroll"; contractAddr=DICEROLL; }
        } catch {}
      }
          if (!bet && BINGO) {
      try {
        const b = await pub.readContract({address:BINGO, abi:BG_ABI, functionName:"getBet", args:[seq]});
        if (b.player !== "0x0000000000000000000000000000000000000000") { bet=b; gameType="bingo"; contractAddr=BINGO; }
      } catch {}
    }
    if (!bet) { setVerifyErr("No bet found for this sequence number. Check the number and try again."); setVerifyLoading(false); return; }
    const reqTx = localStorage.getItem(`txhash:${gameType==="coinflip"?"cf":gameType==="bingo"?"bg":"dr"}-${seq}`);
      let callbackTx = null;
      try {
        const latest = await pub.getBlockNumber();
        const fromBlock = latest > 2000n ? latest - 2000n : 0n;
        const logs = await pub.getLogs({address:contractAddr,event:BET_RESOLVED_EVENT,args:{seqNum:seq},fromBlock,toBlock:"latest"});
        if (logs.length > 0) callbackTx = logs[0].transactionHash;
      } catch {}
      setVerifyResult({gameType, seq:seq.toString(), player:bet.player, status:Number(bet.status), wager:bet.wager, payout:bet.payout, timestamp:Number(bet.timestamp), randomSeed:bet.randomSeed, reqTx, callbackTx, contractAddr});
    } catch { setVerifyErr("Invalid sequence number or network error. Make sure you are on the right network."); }
    setVerifyLoading(false);
  };

  const sortedLb = [...lb].sort((a,b)=>lbSrt==="volume"?Number(b.volume-a.volume):Number(b.pnl-a.pnl)).slice(0,10);
  const wrongNet = isConnected && chainId !== CHAIN_ID;

  // ── Icon helpers ─────────────────────────────────────────────────────────────
  const IcoHome    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
  const IcoGames   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12h.01"/><path d="M7 12h.01"/><path d="M17 12h.01"/><path d="M7 9v6"/><path d="M5 12h4"/></svg>;
  const IcoProfile = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  const IcoCoin    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>;
  const IcoDice    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/></svg>;
  const IcoBingo   = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>;
  const IcoShield  = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
  const IcoChevron = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;
  const IcoRefresh = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
  const IcoSignOut = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
  const IcoCopy    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>;
  const IcoCheck   = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
  const IcoTxCoin  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2 2"/></svg>;
  const IcoTxDice  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1" fill="currentColor"/></svg>;
  const IcoTxBingo = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>;

  return (
    <div className={light?"light":""} style={{minHeight:"100vh",background:light?"linear-gradient(125deg,#e8eeff 0%,#f5f0ff 40%,#e0f0ff 100%)":"transparent",transition:"background 0.4s ease"}}>
      <style>{CSS}</style>

      {showConsent && <ConsentModal onAccept={() => setShowConsent(false)} />}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="hdr" style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:"1px solid var(--bd)",background:"var(--s1)",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <img src="/logo.png" width={44} height={44} style={{borderRadius:10,objectFit:"cover"}} onError={e=>e.target.style.display="none"}/>
          <span className="hdr-logo" style={{fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:16,letterSpacing:"0.05em",textTransform:"uppercase"}}>
            <span style={{background:"linear-gradient(180deg,#60C8FF 0%,#1A7FD4 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>BASE</span>
            <span style={{background:"linear-gradient(180deg,#FFD84D 0%,#E08C00 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>CAST</span>
          </span>
          <span style={{background:"rgba(37,99,235,.15)",border:"1px solid rgba(37,99,235,.3)",borderRadius:6,padding:"2px 8px",fontSize:10,color:"var(--blue)",letterSpacing:"1px"}}>Testnet</span>
        </div>
        <div className="hdr-right" style={{display:"flex",alignItems:"center",gap:8}}>
          {isConnected && authed && (
            <div style={{textAlign:"right",lineHeight:1.2}}>
              <div style={{fontSize:9,color:"var(--sub)",letterSpacing:"1px"}}>BALANCE</div>
              <div className="mono" style={{fontSize:13,color:"var(--green)",fontWeight:600}}>{usd(bal)}</div>
            </div>
          )}
          <ConnectButton.Custom>
            {({account,chain,openChainModal,openConnectModal,mounted}) => {
              if (!mounted) return null;
              if (!account) return (
                <button onClick={openConnectModal} className="btn" style={{background:"linear-gradient(135deg,#6C63FF,#4F46E5)",color:"#fff",padding:"7px 14px",borderRadius:8,fontSize:12,width:"auto"}}>Connect</button>
              );
              return (
                <button onClick={openChainModal} className="btn" style={{background:"var(--s2)",border:"1px solid var(--bd)",color:"var(--tx)",padding:"6px 10px",borderRadius:8,fontSize:12,width:"auto",gap:5}}>
                  {chain?.hasIcon && chain.iconUrl && <img src={chain.iconUrl} width={14} height={14} alt={chain.name} style={{borderRadius:"50%"}}/>}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}><path d="M7 10l5 5 5-5z"/></svg>
                </button>
              );
            }}
          </ConnectButton.Custom>
          <button className="btn" onClick={()=>setLight(l=>!l)} style={{background:"var(--s2)",border:"1px solid var(--bd)",color:"var(--tx)",padding:"7px 10px",borderRadius:8,width:"auto"}}>
            {light
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            }
          </button>
        </div>
      </header>

      {wrongNet && (
        <div style={{background:"rgba(239,68,68,.1)",borderBottom:"1px solid rgba(239,68,68,.3)",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
          <span style={{fontSize:12,color:"var(--red)"}}>Wrong network</span>
          <button className="btn primary" style={{padding:"6px 14px",width:"auto",fontSize:12}} onClick={()=>switchChain({chainId:CHAIN_ID})}>Switch to Base Sepolia</button>
        </div>
      )}

      {/* ── Landing page for newcomers ────────────────────────────────── */}
      {!isConnected && (
        <div style={{minHeight:"calc(100vh - 73px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",padding:"0 0 48px"}}>

          {/* Hero */}
          <div style={{width:"100%",maxWidth:520,padding:"40px 24px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:0}}>

            {/* Headline */}
            <div style={{textAlign:"center",marginBottom:8}}>
              <div style={{fontFamily:"'Outfit',sans-serif",fontWeight:300,fontSize:16,color:"var(--sub)",letterSpacing:"3px",textTransform:"uppercase",marginBottom:6}}>Welcome to</div>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:"clamp(42px,12vw,72px)",letterSpacing:"0.03em",textTransform:"uppercase",lineHeight:1,userSelect:"none"}}>
                <span style={{background:"linear-gradient(180deg,#60C8FF 0%,#1A7FD4 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>BASE</span>
                <span style={{background:"linear-gradient(180deg,#FFD84D 0%,#C87000 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>CAST</span>
              </div>
            </div>

            {/* Divider line with diamond */}
            <div style={{display:"flex",alignItems:"center",gap:10,margin:"14px 0",width:"100%",maxWidth:320}}>
              <div style={{flex:1,height:1,background:"linear-gradient(90deg,transparent,rgba(100,160,255,0.4))"}}/>
              <div style={{width:7,height:7,background:"#F59E0B",transform:"rotate(45deg)",flexShrink:0}}/>
              <div style={{flex:1,height:1,background:"linear-gradient(90deg,rgba(100,160,255,0.4),transparent)"}}/>
            </div>

            {/* Subtitle */}
            <div style={{fontSize:14,color:"var(--sub)",textAlign:"center",lineHeight:1.7,marginBottom:28,maxWidth:310}}>
              The provably fair on-chain game hub on&nbsp;
              <span style={{color:"#60C8FF",fontWeight:600}}>Base chain</span>
              &nbsp;— powered by&nbsp;
              <span style={{color:"#FFD84D",fontWeight:600}}>Pyth Entropy v2</span>
            </div>

            {/* Connect CTA */}
            <ConnectButton.Custom>
              {({openConnectModal,mounted}) => mounted && (
                <button
                  onClick={openConnectModal}
                  style={{
                    width:"100%",maxWidth:340,padding:"17px 24px",
                    background:"linear-gradient(135deg,#2563EB 0%,#1A4FD4 100%)",
                    border:"none",borderRadius:12,cursor:"pointer",
                    fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:17,
                    color:"#fff",letterSpacing:"0.3px",
                    boxShadow:"0 4px 24px rgba(37,99,235,0.5)",
                    transition:"all .15s",
                    display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                  }}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 32px rgba(37,99,235,0.65)";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="0 4px 24px rgba(37,99,235,0.5)";}}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="15" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><path d="M12 12v3"/></svg>
                  Connect Wallet to Play
                </button>
              )}
            </ConnectButton.Custom>

            {/* Trust strip */}
            <div style={{display:"flex",gap:20,marginTop:22,flexWrap:"wrap",justifyContent:"center"}}>
              {[
                {icon:"🔒",label:"No KYC"},
                {icon:"⛓",label:"100% On-Chain"},
                {icon:"🎲",label:"3 Games"},
                {icon:"⚡",label:"Instant Payouts"},
              ].map(({icon,label})=>(
                <div key={label} style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"var(--sub)"}}>
                  <span style={{fontSize:14}}>{icon}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div style={{width:"100%",height:1,background:"var(--bd)",margin:"32px 0 24px"}}/>

            {/* Game cards */}
            <div style={{width:"100%",display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:11,color:"var(--sub)",letterSpacing:"1.5px",marginBottom:4}}>AVAILABLE GAMES</div>
              {[
                {label:"Coin Flip",    desc:"50/50 — Heads or Tails",         mult:"1.94×",  color:"#F59E0B", bg:"rgba(245,158,11,0.1)",   icon:"🪙"},
                {label:"Dice Roll",    desc:"Range or exact number",            mult:"up to 5.82×", color:"#2563EB", bg:"rgba(37,99,235,0.1)",    icon:"🎲"},
                {label:"Bingo",        desc:"Pattern matching · 4 modes",       mult:"up to 5×",    color:"#60C8FF", bg:"rgba(96,200,255,0.1)",   icon:"🎯"},
              ].map(({label,desc,mult,color,bg,icon})=>(
                <div key={label} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:12}}>
                  <div style={{width:44,height:44,borderRadius:12,background:bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:14,color:"var(--tx)"}}>{label}</div>
                    <div style={{fontSize:11,color:"var(--sub)",marginTop:2}}>{desc}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:11,color:"var(--sub)"}}>Payout</div>
                    <div style={{fontSize:14,fontWeight:700,color}}>{mult}</div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}

      {/* ── App UI (connected) ────────────────────────────────────────────── */}
      {isConnected && (<>

      {/* ── 3-item Navigation ─────────────────────────────────────────── */}
      <nav className="nav-bar">
        {[
          {id:"home",    label:"Home",    Icon:IcoHome},
          {id:"games",   label:"Games",   Icon:IcoGames},
          {id:"profile", label:"Profile", Icon:IcoProfile},
        ].map(({id,label,Icon})=>(
          <button
            key={id}
            className={`nav-item${navSection===id?" active":""}`}
            onClick={()=>{
              if(id==="games"){setGamesOpen(true);}
              else{setNavSection(id);}
            }}
          >
            <Icon/>
            {label}
          </button>
        ))}
      </nav>

      {/* ── Games popup ───────────────────────────────────────────────── */}
      {gamesOpen && (
        <div style={{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.6)"}} onClick={()=>setGamesOpen(false)}/>
          <div className="fi" style={{position:"relative",background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:520,padding:"24px 20px 36px",zIndex:101}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontWeight:700,fontSize:16,color:"var(--tx)"}}>Select Game</div>
              <button onClick={()=>setGamesOpen(false)} style={{background:"none",border:"1px solid var(--bd)",borderRadius:8,color:"var(--sub)",padding:"4px 10px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:12}}>Close</button>
            </div>
            {[
              {id:"coinflip", label:"Coin Flip",   desc:"50/50 · 1.94× payout",         Icon:IcoCoin},
              {id:"dice",     label:"Dice Roll",   desc:"Range 1.94× · Exact 5.82×",     Icon:IcoDice},
              {id:"bingo",    label:"Bingo",       desc:"Pattern matching · up to 5×",   Icon:IcoBingo},
              {id:"verify",   label:"Verify Bet",  desc:"Check any bet on-chain",         Icon:IcoShield},
            ].map(({id,label,desc,Icon})=>(
              <button key={id} className="game-card-btn" onClick={()=>{setTab(id);setNavSection("games");setGamesOpen(false);}}>
                <div style={{width:44,height:44,borderRadius:12,background:"rgba(108,99,255,.15)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--blue)",flexShrink:0}}>
                  <Icon/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,color:"var(--tx)"}}>{label}</div>
                  <div style={{fontSize:11,color:"var(--sub)",marginTop:2}}>{desc}</div>
                </div>
                <div style={{color:"var(--sub)",flexShrink:0}}><IcoChevron/></div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────── */}
      <main className="main-pad main-content-wrap" style={{maxWidth:520,margin:"0 auto",padding:"20px 16px"}}>

        {/* ══ HOME ═══════════════════════════════════════════════════════ */}
        {navSection==="home" && (
          <div className="fi" style={{display:"flex",flexDirection:"column",gap:16}}>

            {/* Stats bar */}
            <div className="stats-bar" style={{display:"flex",background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:14,overflow:"hidden"}}>
              {[{l:"VAULT",v:usd(vault.b)},{l:"MAX BET",v:usd(vault.max)},{l:"MIN BET",v:usd(vault.min)}].map(({l,v},i)=>(
                <div key={i} style={{flex:1,padding:"12px 16px",borderRight:i<2?"1px solid var(--bd)":"none"}}>
                  <div style={{fontSize:9,color:"var(--sub)",letterSpacing:"1.5px"}}>{l}</div>
                  <div className="mono" style={{fontSize:14,marginTop:3,color:"var(--tx)",fontWeight:600}}>{v}</div>
                </div>
              ))}
            </div>

            {/* Hero */}
            <div className="card" style={{textAlign:"center",padding:"40px 24px",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 0%,rgba(108,99,255,.1),transparent 65%)",pointerEvents:"none"}}/>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:11,letterSpacing:"0.25em",textTransform:"uppercase",color:"#fff",opacity:0.7,marginBottom:8}}>WELCOME TO</div>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:48,letterSpacing:"0.04em",lineHeight:1,textTransform:"uppercase"}}>
                <span style={{background:"linear-gradient(180deg,#60C8FF 0%,#1A7FD4 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",filter:"drop-shadow(0 0 18px rgba(96,200,255,0.45))"}}>BASE</span>
                <span style={{background:"linear-gradient(180deg,#FFD84D 0%,#E08C00 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",filter:"drop-shadow(0 0 18px rgba(255,216,77,0.45))"}}>CAST</span>
              </div>
              <div style={{fontFamily:"'Courgette',cursive",fontSize:12,color:"var(--sub)",marginTop:14,marginBottom:28}}>
                Provably fair on-chain game hub &middot; Base chain
              </div>
              {!isConnected
                ? <div style={{display:"flex",justifyContent:"center"}}><ConnectButton label="Connect Wallet to Play"/></div>
                : !authed
                  ? <button className="btn primary spulse" style={{width:"auto",padding:"12px 28px",fontSize:14}} onClick={doSign} disabled={signing}>{signing?<><Spin/>Waiting...</>:<>Sign to Enter</>}</button>
                  : <button className="btn primary" style={{width:"auto",padding:"12px 28px",fontSize:14}} onClick={()=>setGamesOpen(true)}>Play Now</button>
              }
            </div>

            {/* Games overview */}
            <div style={{fontWeight:700,fontSize:13,color:"var(--sub)",letterSpacing:"1.5px",padding:"0 4px"}}>AVAILABLE GAMES</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[
                {id:"coinflip",label:"Coin Flip",  mult:"1.94×",  desc:"Pick heads or tails",        Icon:IcoCoin,  color:"#6C63FF"},
                {id:"dice",    label:"Dice Roll",  mult:"5.82×",  desc:"Range or exact number",       Icon:IcoDice,  color:"#00F5A0"},
                {id:"bingo",   label:"Bingo",      mult:"5×",     desc:"Match a winning pattern",     Icon:IcoBingo, color:"#FFD166"},
                {id:"verify",  label:"Verify Bet", mult:"",       desc:"Audit any bet on-chain",      Icon:IcoShield,color:"#9094B0"},
              ].map(({id,label,mult,desc,Icon,color})=>(
                <button key={id} className="card" onClick={()=>{setTab(id);setNavSection("games");}} style={{cursor:"pointer",display:"flex",flexDirection:"column",gap:10,alignItems:"flex-start",border:"1px solid var(--bd)",transition:"border-color .15s,transform .15s",background:"rgba(255,255,255,0.04)"}}>
                  <div style={{width:40,height:40,borderRadius:10,background:`rgba(108,99,255,.12)`,display:"flex",alignItems:"center",justifyContent:"center",color:color}}>
                    <Icon/>
                  </div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"var(--tx)"}}>{label}</div>
                    <div style={{fontSize:11,color:"var(--sub)",marginTop:3}}>{desc}</div>
                  </div>
                  {mult && <div style={{fontSize:12,fontWeight:700,color:"var(--gold)"}}>Up to {mult}</div>}
                </button>
              ))}
            </div>

            {/* How it works */}
            <div className="card" style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{fontWeight:700,fontSize:14,color:"var(--tx)"}}>How It Works</div>
              {[
                {Icon:IcoShield, title:"Pyth Entropy v2", body:"Every outcome is generated on-chain using Pyth's verifiable random function. No one, including us, can predict or manipulate results."},
                {Icon:IcoCoin,   title:"USDC Wagers",     body:"All bets are placed in USDC on Base. Approve once and play as many rounds as you want."},
                {Icon:IcoShield, title:"Verify Anytime",  body:"Use the Verify Bet tool to audit any past result directly from the blockchain using its sequence number."},
              ].map(({Icon,title,body},i)=>(
                <div key={i} style={{display:"flex",gap:12}}>
                  <div style={{width:36,height:36,borderRadius:10,background:"rgba(108,99,255,.1)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--blue)",flexShrink:0}}><Icon/></div>
                  <div>
                    <div style={{fontWeight:600,fontSize:13,color:"var(--tx)",marginBottom:3}}>{title}</div>
                    <div style={{fontSize:12,color:"var(--sub)",lineHeight:1.6}}>{body}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{fontSize:10,color:"var(--dim)",textAlign:"center",paddingBottom:4}}>Pyth Entropy v2 &middot; Provably fair &middot; 3% house edge &middot; Base chain</div>
          </div>
        )}

        {/* ══ GAMES ══════════════════════════════════════════════════════ */}
        {navSection==="games" && (
          <div>
            {/* Game sub-tabs */}
            <div style={{display:"flex",borderBottom:"1px solid var(--bd)",marginBottom:16,overflowX:"auto"}}>
              {[
                {id:"coinflip",Icon:IcoCoin,  label:"Coin Flip"},
                {id:"dice",    Icon:IcoDice,  label:"Dice Roll"},
                {id:"bingo",   Icon:IcoBingo, label:"Bingo"},
                {id:"verify",  Icon:IcoShield,label:"Verify"},
              ].map(({id,Icon,label})=>(
                <button key={id} className={`gametab${tab===id?" on":""}`} onClick={()=>setTab(id)} style={{display:"flex",alignItems:"center",gap:6}}>
                  <Icon/>{label}
                </button>
              ))}
            </div>

            {/* Not connected */}
            {!isConnected && tab!=="verify" && (
              <div className="card fi" style={{textAlign:"center",padding:"48px 24px"}}>
                <div style={{marginBottom:20,color:"var(--sub)",fontSize:14}}>Connect your wallet to play</div>
                <div style={{display:"flex",justifyContent:"center"}}><ConnectButton label="Connect Wallet"/></div>
              </div>
            )}

            {/* Connected but not authed */}
            {isConnected && !authed && tab!=="verify" && (
              <SignScreen isSigning={signing} error={signErr} onSign={doSign}/>
            )}

            {/* ── Coin Flip ── */}
            {tab==="coinflip" && isConnected && authed && (
              <div className="fi" style={{display:"flex",flexDirection:"column",gap:14}}>
                <div className="card" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"32px 20px",minHeight:180,position:"relative",overflow:"hidden"}}>
                  <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 0%,rgba(37,99,235,.06),transparent 70%)",pointerEvents:"none"}}/>
                  {cfS==="idle"&&<><Coin side={cfChoice}/><div style={{fontSize:11,color:"var(--sub)",letterSpacing:"2px"}}>PICK YOUR SIDE</div></>}
                  {busy(cfS)&&<><Coin side={cfCoin} anim={cfS==="pending"}/><div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--blue)"}}><Spin/>{cfS==="approving"?"Approving USDC...":cfS==="placing"?"Placing bet...":"Waiting for Pyth..."}</div></>}
                  {cfS==="settled"&&cfRes&&(
                    <div className={cfRes.won?"win":"lose"} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,width:"100%"}}>
                      <Coin side={cfRes.result}/>
                      <div style={{fontWeight:700,fontSize:28,color:cfRes.won?"var(--green)":"var(--red)"}}>{cfRes.won?`+${usd(cfRes.payout)}`:`-${usd(cfRes.wager)}`}</div>
                      <div style={{fontSize:12,color:"var(--sub)"}}>Rolled <b style={{color:"var(--tx)"}}>{cfRes.result}</b> &middot; You picked <b style={{color:cfRes.won?"var(--green)":"var(--red)"}}>{cfChoice}</b></div>
                      <a href={`${EXPLORER}/tx/${cfRes.hash}`} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"var(--blue)",fontFamily:"'JetBrains Mono',monospace"}}>View on Explorer ↗</a>
                      <button className="btn" style={{background:"var(--s2)",border:"1px solid var(--bd)",color:"var(--sub)",padding:"7px 18px",fontSize:12,borderRadius:8,width:"auto"}} onClick={()=>{setCfS("idle");setCfRes(null);setCfCoin("HEADS")}}>Play again</button>
                    </div>
                  )}
                  {cfErr&&<div style={{fontSize:12,color:"var(--red)",textAlign:"center",padding:"0 8px"}}>{cfErr}</div>}
                </div>
                <div style={{display:"flex",gap:8}}>
                  {["HEADS","TAILS"].map(s=>(
                    <button key={s} className={`btn choice${cfChoice===s?" sel":""}`} style={{flexDirection:"column",gap:6,padding:"16px 10px"}} onClick={()=>{setCfChoice(s);setCfCoin(s)}} disabled={busy(cfS)}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        {s==="HEADS"
                          ? <><circle cx="12" cy="12" r="10" fill="rgba(217,119,6,.2)" stroke="#D97706"/><text x="12" y="16" textAnchor="middle" fill="#D97706" fontSize="10" fontWeight="700" fontFamily="monospace">H</text></>
                          : <><circle cx="12" cy="12" r="10" fill="rgba(107,114,128,.2)" stroke="#6B7280"/><text x="12" y="16" textAnchor="middle" fill="#9CA3AF" fontSize="10" fontWeight="700" fontFamily="monospace">T</text></>
                        }
                      </svg>
                      <span style={{fontSize:13}}>{s}</span>
                      <span style={{fontSize:10,color:"var(--sub)",fontWeight:400}}>1.94×</span>
                    </button>
                  ))}
                </div>
                <div className="card" style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{fontSize:10,color:"var(--sub)",letterSpacing:"2px"}}>WAGER (USDC)</div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{color:"var(--sub)",fontSize:16}}>$</span>
                    <input className="inp" type="number" value={cfWager} onChange={e=>setCfWager(e.target.value)} disabled={busy(cfS)}/>
                  </div>
                  <QuickBtns set={setCfWager}/>
                  <PayInfo wager={cfWager} mult={1.94}/>
                </div>
                <button className="btn primary" style={{fontSize:15,padding:15}} disabled={busy(cfS)||!parseFloat(cfWager)||parseFloat(cfWager)>parseFloat(formatUnits(bal,6))} onClick={doFlip}>
                  {busy(cfS)?<><Spin/>{cfS==="approving"?"Approving...":cfS==="placing"?"Placing...":"Waiting for result..."}</>:<span className="shimmer">FLIP COIN</span>}
                </button>
                <div style={{fontSize:10,color:"var(--dim)",textAlign:"center"}}>Pyth Entropy v2 &middot; Provably fair &middot; 3% house edge</div>
              </div>
            )}

            {/* ── Dice Roll ── */}
            {tab==="dice" && isConnected && authed && (
              <div className="fi" style={{display:"flex",flexDirection:"column",gap:14}}>
                <div className="card" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"32px 20px",minHeight:180,position:"relative",overflow:"hidden"}}>
                  <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 0%,rgba(37,99,235,.06),transparent 70%)",pointerEvents:"none"}}/>
                  {dS==="idle"&&<><Die n={dMode==="exact"?dExact:3} size={72}/><div style={{fontSize:11,color:"var(--sub)",letterSpacing:"2px"}}>PLACE YOUR BET</div></>}
                  {busy(dS)&&<><Die n={dNum} size={72} anim={dS==="pending"}/><div style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--blue)"}}><Spin/>{dS==="approving"?"Approving USDC...":dS==="placing"?"Placing bet...":"Rolling..."}</div></>}
                  {dS==="settled"&&dRes&&(
                    <div className={dRes.won?"win":"lose"} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,width:"100%"}}>
                      <Die n={dRes.rolled} size={72}/>
                      <div style={{fontWeight:700,fontSize:28,color:dRes.won?"var(--green)":"var(--red)"}}>{dRes.won?`+${usd(dRes.payout)}`:`-${usd(dRes.wager)}`}</div>
                      <div style={{fontSize:12,color:"var(--sub)"}}>Rolled <b style={{color:"var(--tx)"}}>{dRes.rolled}</b></div>
                      <a href={`${EXPLORER}/tx/${dRes.hash}`} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"var(--blue)",fontFamily:"'JetBrains Mono',monospace"}}>View on Explorer ↗</a>
                      <button className="btn" style={{background:"var(--s2)",border:"1px solid var(--bd)",color:"var(--sub)",padding:"7px 18px",fontSize:12,borderRadius:8,width:"auto"}} onClick={()=>{setDS("idle");setDRes(null);setDNum(1)}}>Roll again</button>
                    </div>
                  )}
                  {dErr&&<div style={{fontSize:12,color:"var(--red)",textAlign:"center"}}>{dErr}</div>}
                </div>
                <div style={{display:"flex",gap:8}}>
                  {["range","exact"].map(m=>(
                    <button key={m} className={`btn choice${dMode===m?" sel":""}`} style={{padding:14}} onClick={()=>setDMode(m)} disabled={busy(dS)}>{m==="range"?"Range (1.94×)":"Exact (5.82×)"}</button>
                  ))}
                </div>
                {dMode==="range"?(
                  <div style={{display:"flex",gap:8}}>
                    {[
                      {v:true, l:"HIGH", s:"4 · 5 · 6", icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>},
                      {v:false,l:"LOW",  s:"1 · 2 · 3", icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>},
                    ].map(c=>(
                      <button key={c.l} className={`btn choice${dHigh===c.v?" sel":""}`} style={{flexDirection:"column",gap:6,padding:"16px 10px"}} onClick={()=>setDHigh(c.v)} disabled={busy(dS)}>
                        {c.icon}<span style={{fontSize:13}}>{c.l}</span><span style={{fontSize:10,color:"var(--sub)",fontWeight:400}}>{c.s}</span>
                      </button>
                    ))}
                  </div>
                ):(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6}}>
                    {[1,2,3,4,5,6].map(n=>(
                      <button key={n} className={`btn choice${dExact===n?" sel":""}`} style={{padding:"10px 0",justifyContent:"center"}} onClick={()=>setDExact(n)} disabled={busy(dS)}><Die n={n} size={34}/></button>
                    ))}
                  </div>
                )}
                <div className="card" style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{fontSize:10,color:"var(--sub)",letterSpacing:"2px"}}>WAGER (USDC)</div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{color:"var(--sub)",fontSize:16}}>$</span>
                    <input className="inp" type="number" value={dWager} onChange={e=>setDWager(e.target.value)} disabled={busy(dS)}/>
                  </div>
                  <QuickBtns set={setDWager}/>
                  <PayInfo wager={dWager} mult={dMode==="range"?1.94:5.82}/>
                </div>
                <button className="btn primary" style={{fontSize:15,padding:15}} disabled={busy(dS)||!parseFloat(dWager)||parseFloat(dWager)>parseFloat(formatUnits(bal,6))} onClick={doDice}>
                  {busy(dS)?<><Spin/>{dS==="approving"?"Approving...":dS==="placing"?"Placing...":"Rolling..."}</>:<span className="shimmer">ROLL DICE</span>}
                </button>
                <div style={{fontSize:10,color:"var(--dim)",textAlign:"center"}}>Pyth Entropy v2 &middot; Provably fair &middot; 3% house edge</div>
              </div>
            )}

            {/* ── Bingo ── */}
            {tab==="bingo" && isConnected && authed && (
              <div className="fi"><BingoGame balance={bal} refetchBalance={fetchStats} vaultMax={vault.max} vaultMin={vault.min}/></div>
            )}
            {/* ── Verify ── */}
            {tab==="verify" && (
              <div className="fi" style={{display:"flex",flexDirection:"column",gap:16}}>
                <div className="card">
                  <div style={{fontSize:13,fontWeight:700,color:"var(--tx)",marginBottom:4}}>Verify a Bet On-Chain</div>
                  <div style={{fontSize:11,color:"var(--sub)",marginBottom:16,lineHeight:1.6}}>Paste a sequence number from your transaction history to verify the outcome directly from the blockchain.</div>
                  <div style={{display:"flex",gap:8}}>
                    <input className="inp" placeholder="Sequence number (e.g. 73911)" value={verifySeq} onChange={e=>{setVerifySeq(e.target.value);setVerifyResult(null);setVerifyErr(null);}} onKeyDown={e=>e.key==="Enter"&&doVerify()} style={{flex:1,fontSize:14}}/>
                    <button className="btn primary" style={{width:"auto",padding:"0 20px",fontSize:13,flexShrink:0}} onClick={doVerify} disabled={verifyLoading||!verifySeq.trim()}>{verifyLoading?<Spin/>:"Verify"}</button>
                  </div>
                  {verifyErr && <div style={{marginTop:12,fontSize:12,color:"var(--red)",background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",borderRadius:8,padding:"10px 14px"}}>{verifyErr}</div>}
                </div>
                {verifyResult && (
                  <div className="card fi" style={{display:"flex",flexDirection:"column",gap:0}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                      <div style={{fontSize:13,fontWeight:700,color:"var(--tx)"}}>
                        {verifyResult.gameType==="coinflip"?"Coin Flip":verifyResult.gameType==="bingo"?"Bingo":"Dice Roll"} &mdash; Seq #{verifyResult.seq}
                      </div>
                      <div style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,background:verifyResult.status===0?"rgba(245,158,11,.15)":verifyResult.status===1?"rgba(16,185,129,.15)":"rgba(239,68,68,.15)",color:verifyResult.status===0?"var(--gold)":verifyResult.status===1?"var(--green)":"var(--red)"}}>
                        {verifyResult.status===0?"PENDING":verifyResult.status===1?"WON":"LOST"}
                      </div>
                    </div>
                    {[
                      {label:"Chain",      value:CHAIN_ID===8453?"Base Mainnet":"Base Sepolia"},
                      {label:"Sequence #", value:`#${verifyResult.seq}`},
                      {label:"Player",     value:`${verifyResult.player.slice(0,10)}...${verifyResult.player.slice(-8)}`},
                      {label:"Wager",      value:usd(verifyResult.wager)},
                      {label:"Payout",     value:verifyResult.status===1?usd(verifyResult.payout):"—"},
                      {label:"Timestamp",  value:verifyResult.timestamp>0?new Date(verifyResult.timestamp*1000).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}):"—"},
                    ].map(({label,value})=>(
                      <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                        <span style={{fontSize:11,color:"var(--sub)"}}>{label}</span>
                        <span className="mono" style={{fontSize:11,color:"var(--tx)"}}>{value}</span>
                      </div>
                    ))}
                    <div style={{padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:11,color:"var(--sub)"}}>Randomness (seed)</span>
                        <button onClick={()=>navigator.clipboard.writeText(verifyResult.randomSeed)} title="Copy" className="mono" style={{fontSize:9,color:"var(--sub)",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:3,padding:"2px 6px",cursor:"pointer"}}>{verifyResult.randomSeed.slice(0,10)}...{verifyResult.randomSeed.slice(-8)}</button>
                      </div>
                    </div>
                    <div style={{padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:11,color:"var(--sub)"}}>Request Tx</span>
                        {verifyResult.reqTx
                          ? <a href={`${EXPLORER}/tx/${verifyResult.reqTx}`} target="_blank" rel="noopener noreferrer" className="mono" style={{fontSize:11,color:"var(--blue)",textDecoration:"none"}}>{verifyResult.reqTx.slice(0,10)}...{verifyResult.reqTx.slice(-8)} ↗</a>
                          : <span style={{fontSize:11,color:"var(--dim)"}}>Not stored locally</span>}
                      </div>
                    </div>
                    <div style={{padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:11,color:"var(--sub)"}}>Callback Tx</span>
                        {verifyResult.callbackTx
                          ? <a href={`${EXPLORER}/tx/${verifyResult.callbackTx}`} target="_blank" rel="noopener noreferrer" className="mono" style={{fontSize:11,color:"var(--blue)",textDecoration:"none"}}>{verifyResult.callbackTx.slice(0,10)}...{verifyResult.callbackTx.slice(-8)} ↗</a>
                          : <span style={{fontSize:11,color:"var(--dim)"}}>{verifyResult.status===0?"Pending...":"Not in recent blocks"}</span>}
                      </div>
                    </div>
                    <div style={{padding:"9px 0"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontSize:11,color:"var(--sub)"}}>Pyth Entropy</span>
                        <a href={`${PYTH_EXPLORER}&address=${verifyResult.contractAddr}&sequence=${verifyResult.seq}`} target="_blank" rel="noopener noreferrer" className="mono" style={{fontSize:11,color:"var(--blue)",textDecoration:"none"}}>View randomness ↗</a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ PROFILE ════════════════════════════════════════════════════ */}
        {navSection==="profile" && (
          <div className="fi" style={{display:"flex",flexDirection:"column",gap:14}}>
            {!isConnected ? (
              <div className="card" style={{textAlign:"center",padding:"48px 24px"}}>
                <div style={{marginBottom:20,color:"var(--sub)",fontSize:14}}>Connect your wallet to view your profile</div>
                <div style={{display:"flex",justifyContent:"center"}}><ConnectButton label="Connect Wallet"/></div>
              </div>
            ) : !authed ? (
              <SignScreen isSigning={signing} error={signErr} onSign={doSign}/>
            ) : (
              <>
                {/* Wallet card */}
                <div className="card" style={{display:"flex",flexDirection:"column",gap:14}}>
                  <div style={{fontSize:10,color:"var(--sub)",letterSpacing:"1.5px"}}>CONNECTED WALLET</div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:40,height:40,borderRadius:12,background:"linear-gradient(135deg,#6C63FF,#4F46E5)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14,fontWeight:700,color:"#fff",fontFamily:"monospace"}}>
                      {address?address.slice(2,4).toUpperCase():"??"}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div className="mono" style={{fontSize:13,color:"var(--tx)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{shortAddr(address)}</div>
                      <div style={{fontSize:10,color:"var(--sub)",marginTop:2}}>{CHAIN_ID===8453?"Base Mainnet":"Base Sepolia"}</div>
                    </div>
                    <button onClick={copyAddress} style={{background:"none",border:"1px solid var(--bd)",borderRadius:8,color:copied?"var(--green)":"var(--sub)",fontSize:11,padding:"6px 10px",cursor:"pointer",fontFamily:"'Outfit',sans-serif",flexShrink:0,display:"flex",alignItems:"center",gap:5,transition:"color 0.2s"}}>
                      {copied?<><IcoCheck/>Copied</>:<><IcoCopy/>Copy</>}
                    </button>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <div style={{background:"var(--s2)",borderRadius:10,padding:"12px 14px"}}>
                      <div style={{fontSize:9,color:"var(--sub)",letterSpacing:"1.5px",marginBottom:4}}>USDC BALANCE</div>
                      <div className="mono" style={{fontSize:18,fontWeight:700,color:"var(--green)"}}>{usd(bal)}</div>
                    </div>
                    <div style={{background:"var(--s2)",borderRadius:10,padding:"12px 14px"}}>
                      <div style={{fontSize:9,color:"var(--sub)",letterSpacing:"1.5px",marginBottom:4}}>NET PROFIT</div>
                      {myPnl===null
                        ? <div style={{fontSize:13,color:"var(--sub)"}}>Loading...</div>
                        : <div className="mono" style={{fontSize:18,fontWeight:700,color:myPnl>=0n?"var(--green)":"var(--red)"}}>{myPnl>=0n?"+":""}{pnl(myPnl)}</div>
                      }
                    </div>
                  </div>
                </div>

                {/* Transaction history */}
                <div style={{fontWeight:700,fontSize:13,color:"var(--sub)",letterSpacing:"1.5px",padding:"0 4px"}}>TRANSACTION HISTORY</div>
                {txLoading ? (
                  <div style={{display:"flex",justifyContent:"center",padding:32}}><Spin size={24}/></div>
                ) : txHistory.length===0 ? (
                  <div className="card" style={{textAlign:"center",padding:32,color:"var(--sub)",fontSize:13}}>No transactions yet</div>
                ) : (
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {groupByDate(txExpanded ? txHistory : txHistory.slice(0,5)).map(([date,txs])=>(
                      <div key={date}>
                        <div style={{fontSize:9,color:"var(--sub)",letterSpacing:"0.8px",padding:"6px 4px",marginBottom:4}}>{date}</div>
                        {txs.map(tx=>(
                          <div key={tx.id} className="card" style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",marginBottom:6}}>
                            <div style={{display:"flex",alignItems:"center",gap:10}}>
                              <div style={{width:32,height:32,borderRadius:8,background:tx.won?"rgba(0,245,160,.1)":"rgba(255,77,109,.1)",display:"flex",alignItems:"center",justifyContent:"center",color:tx.won?"var(--green)":"var(--red)",flexShrink:0}}>
                                {tx.type==="coinflip"?<IcoTxCoin/>:tx.type==="bingo"?<IcoTxBingo/>:<IcoTxDice/>}
                              </div>
                              <div>
                                <div style={{fontSize:12,color:"var(--tx)",fontWeight:500}}>{tx.type==="coinflip"?"Coin Flip":tx.type==="bingo"?`Bingo · ${tx.subLabel}`:"Dice Roll"}</div>
                                <div style={{fontSize:10,color:"var(--sub)",marginTop:2}}>{new Date(tx.timestamp*1000).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}</div>
                              </div>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div className="mono" style={{fontSize:12,fontWeight:700,color:tx.won?"var(--green)":"var(--red)"}}>{tx.won?`+${usd(tx.payout)}`:`-${usd(tx.wager)}`}</div>
                              {tx.txHash && <a href={`${EXPLORER}/tx/${tx.txHash}`} target="_blank" rel="noopener noreferrer" className="mono" style={{fontSize:10,color:"var(--blue)",textDecoration:"none"}}>{tx.txHash.slice(0,6)}...{tx.txHash.slice(-4)} ↗</a>}
                              <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4,marginTop:2}}>
                                <span style={{fontSize:9,color:"var(--sub)"}}>seq:</span>
                                <button onClick={()=>navigator.clipboard.writeText(tx.seqNum)} title="Copy seq" className="mono" style={{fontSize:9,color:"var(--sub)",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:3,padding:"1px 4px",cursor:"pointer"}}>{tx.seqNum}</button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                    {txHistory.length > 5 && (
                      <button
                        onClick={() => setTxExpanded(e => !e)}
                        style={{
                          width:"100%",padding:"11px",marginTop:2,
                          background:"var(--s2)",border:"1px solid var(--bd)",
                          borderRadius:10,cursor:"pointer",
                          fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600,
                          color:"var(--blue)",display:"flex",alignItems:"center",
                          justifyContent:"center",gap:6,transition:"background .15s",
                        }}
                        onMouseEnter={e=>e.currentTarget.style.background="rgba(108,99,255,.12)"}
                        onMouseLeave={e=>e.currentTarget.style.background="var(--s2)"}
                      >
                        {txExpanded ? (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                            See less
                          </>
                        ) : (
                          <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            See more ({txHistory.length - 5} more)
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Leaderboard */}
                <div style={{fontWeight:700,fontSize:13,color:"var(--sub)",letterSpacing:"1.5px",padding:"4px 4px 0"}}>LEADERBOARD</div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  {["volume","pnl"].map(s=>(
                    <button key={s} className="btn" style={{background:lbSrt===s?"var(--blue)":"var(--s2)",border:`1px solid ${lbSrt===s?"var(--blue)":"var(--bd)"}`,color:lbSrt===s?"#fff":"var(--sub)",padding:"7px 14px",fontSize:12,borderRadius:8,width:"auto"}} onClick={()=>setLbSrt(s)}>{s==="volume"?"By Volume":"By PnL"}</button>
                  ))}
                  <button className="btn" style={{background:"var(--s2)",border:"1px solid var(--bd)",color:"var(--sub)",padding:"8px 10px",borderRadius:8,width:"auto"}} onClick={fetchLb}><IcoRefresh/></button>
                </div>
                {lbLd?(
                  <div style={{display:"flex",justifyContent:"center",padding:48}}><Spin size={28}/></div>
                ):sortedLb.length===0?(
                  <div className="card" style={{textAlign:"center",padding:48,color:"var(--sub)",fontSize:13}}>No players yet — be the first!</div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {sortedLb.map((p,i)=>(
                      <div key={p.address} className="card" style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderLeft:`3px solid ${i===0?"var(--gold)":i===1?"#9CA3AF":i===2?"#D97706":"var(--bd)"}`}}>
                        <div style={{width:28,height:28,borderRadius:"50%",background:i===0?"rgba(245,158,11,.15)":"var(--s2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:i===0?"var(--gold)":i===1?"#9CA3AF":i===2?"#D97706":"var(--sub)",flexShrink:0}}>{i+1}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div className="mono" style={{fontSize:12,color:p.address===address?"var(--blue)":"var(--tx)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {p.address.slice(0,8)}...{p.address.slice(-6)}
                            {p.address===address&&<span style={{marginLeft:6,fontSize:9,color:"var(--blue)",background:"rgba(37,99,235,.1)",borderRadius:4,padding:"1px 5px"}}>YOU</span>}
                          </div>
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div className="mono" style={{fontSize:12,color:"var(--tx)",fontWeight:600}}>{usd(p.volume)}</div>
                          <div className="mono" style={{fontSize:11,marginTop:2,color:p.pnl>=0n?"var(--green)":"var(--red)"}}>{pnl(p.pnl)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{display:"flex",justifyContent:"space-between",padding:"0 4px",fontSize:10,color:"var(--dim)"}}>
                  <span>Top 10 &middot; {lb.length} players</span>
                  <span>Vol = total wagered &middot; PnL = net profit</span>
                </div>

                {/* Sign out */}
                <button
                  onClick={()=>{localStorage.removeItem(SESSION_KEY);setAuthed(false);setNavSection("home");}}
                  style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,width:"100%",padding:"12px 16px",background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.2)",borderRadius:12,color:"#EF4444",cursor:"pointer",fontFamily:"'Outfit',sans-serif",fontSize:13,fontWeight:600}}
                >
                  <IcoSignOut/>Sign Out
                </button>
              </>
            )}
          </div>
        )}

      </main>

      </>)}

      <AppFooter />
    </div>
  );
}
