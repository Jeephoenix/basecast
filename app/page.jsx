"use client";
// app/page.jsx — BaseCast v2

import { AppFooter } from "@/components/PolicyModal";
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
const USDC     = process.env.NEXT_PUBLIC_USDC_ADDRESS;
const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "84532");
const EXPLORER = CHAIN_ID === 8453 ? "https://basescan.org" : "https://sepolia.basescan.org";

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
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Orbitron:wght@900&display=swap');
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
.choice.sel{border-color:var(--blue);background:rgba(37,99,235,.1);color:var(--tx)}
.choice:hover:not(:disabled){border-color:var(--blue);color:var(--tx)}
.inp{background:var(--s2);border:1.5px solid var(--bd);border-radius:10px;color:var(--tx);font-family:'Outfit',sans-serif;font-size:18px;font-weight:600;padding:12px 16px;width:100%;outline:none}
.inp:focus{border-color:var(--blue)}
.card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:20px;backdrop-filter:blur(20px);box-shadow:0 8px 32px rgba(0,0,0,0.4)}
.tab{background:none;border:none;border-bottom:2px solid transparent;font-family:'Outfit',sans-serif;font-size:14px;font-weight:500;padding:12px 20px;cursor:pointer;color:var(--sub);transition:all .15s}
.tab.on{color:var(--tx);border-bottom-color:var(--blue)}
.mono{font-family:'JetBrains Mono',monospace}
@keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
.shimmer{background:linear-gradient(90deg,#00F5A0,#a8ff78,#FFD166,#00D4AA,#00F5A0);background-size:300%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shimmer 2.5s linear infinite;font-weight:700}
`;

// ── Sub-components ────────────────────────────────────────────────────────────
const Spin = ({size=16}) => (
  <div className="sp" style={{width:size,height:size,borderRadius:"50%",border:`2px solid rgba(255,255,255,.2)`,borderTopColor:"#fff",flexShrink:0}}/>
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
      <img src="/logo.png" width={60} height={60} style={{borderRadius:14}} onError={e=>e.target.style.display="none"}/>
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
  const [tab, setTab] = useState("coinflip");
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

  useEffect(() => {
    if (address && getSession(address)) setAuthed(true);
    else setAuthed(false);
  }, [address]);

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

  useEffect(()=>{ if(tab==="leaderboard") fetchLb(); },[tab,fetchLb]);

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
  const sortedLb = [...lb].sort((a,b)=>lbSrt==="volume"?Number(b.volume-a.volume):Number(b.pnl-a.pnl)).slice(0,10);
  const wrongNet = isConnected && chainId !== CHAIN_ID;

  return (
    <div className={light?"light":""} style={{minHeight:"100vh",background:light?"linear-gradient(125deg,#e8eeff 0%,#f5f0ff 40%,#e0f0ff 100%)":"transparent",transition:"background 0.4s ease"}}>
      <style>{CSS}</style>

      <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:"1px solid var(--bd)",background:"var(--s1)",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <img src="/logo.png" width={32} height={32} style={{borderRadius:8,objectFit:"cover"}} onError={e=>e.target.style.display="none"}/>
          <span style={{fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:16,letterSpacing:"0.05em",textTransform:"uppercase"}}>
            <span style={{background:"linear-gradient(180deg,#60C8FF 0%,#1A7FD4 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>BASE</span>
            <span style={{background:"linear-gradient(180deg,#FFD84D 0%,#E08C00 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>CAST</span>
          </span>
          <span style={{background:"rgba(37,99,235,.15)",border:"1px solid rgba(37,99,235,.3)",borderRadius:6,padding:"2px 8px",fontSize:10,color:"var(--blue)",letterSpacing:"1px"}}>BETA</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {isConnected && authed && (
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:"var(--sub)"}}>BALANCE</div>
              <div className="mono" style={{fontSize:13,color:"var(--green)"}}>{usd(bal)}</div>
            </div>
          )}
          <ConnectButton chainStatus="icon" accountStatus="avatar" showBalance={false}/>
          <button className="btn" onClick={()=>setLight(l=>!l)} style={{background:"var(--s2)",border:"1px solid var(--bd)",color:"var(--tx)",padding:"7px 10px",borderRadius:8,width:"auto"}}>
            {light
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            }
          </button>
          {authed && <button className="btn" style={{background:"var(--s2)",border:"1px solid var(--bd)",color:"var(--tx)",padding:"7px 12px",fontSize:11,borderRadius:8,width:"auto"}}
            onClick={()=>{localStorage.removeItem(SESSION_KEY);setAuthed(false);}}>Sign out</button>}
        </div>
      </header>

      {wrongNet && (
        <div style={{background:"rgba(239,68,68,.1)",borderBottom:"1px solid rgba(239,68,68,.3)",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
          <span style={{fontSize:12,color:"var(--red)"}}>⚠ Wrong network</span>
          <button className="btn primary" style={{padding:"6px 14px",width:"auto",fontSize:12}} onClick={()=>switchChain({chainId:CHAIN_ID})}>Switch to Base</button>
        </div>
      )}

      <div style={{display:"flex",borderBottom:"1px solid var(--bd)",background:"var(--s1)",overflowX:"auto"}}>
        {[{l:"VAULT",v:usd(vault.b)},{l:"MAX BET",v:usd(vault.max)},{l:"MIN BET",v:usd(vault.min)}].map(({l,v},i)=>(
          <div key={i} style={{padding:"8px 20px",borderRight:"1px solid var(--bd)",flexShrink:0}}>
            <div style={{fontSize:9,color:"var(--sub)",letterSpacing:"1.5px"}}>{l}</div>
            <div className="mono" style={{fontSize:13,marginTop:2,color:"var(--tx)",transition:"color 0.4s ease"}}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{display:"flex",borderBottom:"1px solid var(--bd)",background:"var(--s1)"}}>
        {[
          {id:"coinflip",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{flexShrink:0}}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/><path d="M8 2l4 3-4 3" strokeLinecap="round"/></svg>,label:"Coin Flip"},
          {id:"dice",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0}}><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.5" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.5" fill="currentColor"/></svg>,label:"Dice Roll"},
          {id:"leaderboard",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0}}><rect x="2" y="14" width="4" height="8"/><rect x="9" y="9" width="4" height="13"/><rect x="16" y="4" width="4" height="18"/></svg>,label:"Leaderboard"},
          {id:"more",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0}}><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></svg>,label:"More Coming..."},
        ].map(t=>(
          <button key={t.id} className={`tab${tab===t.id?" on":""}`} onClick={()=>setTab(t.id)} disabled={t.id==="more"} style={{display:"flex",alignItems:"center",gap:6,...(t.id==="more"?{opacity:.4,cursor:"default"}:{})}}>{t.icon}{t.label}</button>
        ))}
      </div>

      <main style={{maxWidth:480,margin:"0 auto",padding:"20px 16px"}}>

        {!isConnected && tab!=="leaderboard" && (
          <div className="card fi" style={{textAlign:"center",padding:"48px 24px"}}>
            <div style={{marginBottom:28}}>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:11,letterSpacing:"0.25em",textTransform:"uppercase",color:"#fff",opacity:0.85,marginBottom:8}}>
                WELCOME TO
              </div>
              <div style={{fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:48,letterSpacing:"0.04em",lineHeight:1,textTransform:"uppercase"}}>
                <span style={{background:"linear-gradient(180deg,#60C8FF 0%,#1A7FD4 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",filter:"drop-shadow(0 0 18px rgba(96,200,255,0.45))"}}>BASE</span>
                <span style={{background:"linear-gradient(180deg,#FFD84D 0%,#E08C00 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",filter:"drop-shadow(0 0 18px rgba(255,216,77,0.45))"}}>CAST</span>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:18}}>
                <div style={{flex:1,height:1,background:"linear-gradient(to right,transparent,#4A90D9)",maxWidth:60}}/>
                <span style={{fontFamily:"'Orbitron',sans-serif",fontWeight:700,fontSize:9,letterSpacing:"0.2em",color:"#7AADCC",textTransform:"uppercase",whiteSpace:"nowrap"}}>
                  Provably fair on-chain game hub <span style={{color:"#60C8FF",fontSize:10}}>■</span> Base chain
                </span>
                <div style={{flex:1,height:1,background:"linear-gradient(to left,transparent,#4A90D9)",maxWidth:60}}/>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"center"}}>
  <ConnectButton label="Connect Wallet to Play"/>
</div>
          </div>
        )}

        {isConnected && !authed && tab!=="leaderboard" && (
          <SignScreen isSigning={signing} error={signErr} onSign={doSign}/>
        )}

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
                  <div style={{fontSize:12,color:"var(--sub)"}}>Rolled <b style={{color:"var(--tx)"}}>{cfRes.result}</b> · You picked <b style={{color:cfRes.won?"var(--green)":"var(--red)"}}>{cfChoice}</b></div>
                  <a href={`${EXPLORER}/tx/${cfRes.hash}`} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"var(--blue)",fontFamily:"'JetBrains Mono',monospace"}}>View on Explorer ↗</a>
                  <button className="btn" style={{background:"var(--s2)",border:"1px solid var(--bd)",color:"var(--sub)",padding:"7px 18px",fontSize:12,borderRadius:8,width:"auto"}} onClick={()=>{setCfS("idle");setCfRes(null);setCfCoin("HEADS")}}>Play again</button>
                </div>
              )}
              {cfErr&&<div style={{fontSize:12,color:"var(--red)",textAlign:"center",padding:"0 8px"}}>⚠ {cfErr}</div>}
            </div>
            <div style={{display:"flex",gap:8}}>
              {["HEADS","TAILS"].map(s=>(
                <button key={s} className={`btn choice${cfChoice===s?" sel":""}`} style={{flexDirection:"column",gap:6,padding:"14px 10px"}} onClick={()=>{setCfChoice(s);setCfCoin(s)}} disabled={busy(cfS)}>
                  <span style={{fontSize:22}}>{s==="HEADS"?"🟡":"⚪"}</span>
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
              {busy(cfS)?<><Spin/>{cfS==="approving"?"Approving...":cfS==="placing"?"Placing...":"Waiting for result..."}</>:<span className="shimmer">{`FLIP $${cfWager} → $${(parseFloat(cfWager||0)*1.94).toFixed(2)}`}</span>}
            </button>
            <div style={{fontSize:10,color:"var(--dim)",textAlign:"center"}}>Pyth Entropy v2 · Provably fair · 3% house edge</div>
          </div>
        )}

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
              {dErr&&<div style={{fontSize:12,color:"var(--red)",textAlign:"center"}}>⚠ {dErr}</div>}
            </div>
            <div style={{display:"flex",gap:8}}>
              {["range","exact"].map(m=>(
                <button key={m} className={`btn choice${dMode===m?" sel":""}`} style={{padding:11}} onClick={()=>setDMode(m)} disabled={busy(dS)}>{m==="range"?"Range (1.94×)":"Exact (5.82×)"}</button>
              ))}
            </div>
            {dMode==="range"?(
              <div style={{display:"flex",gap:8}}>
                {[{v:true,l:"HIGH",e:"⬆",s:"4·5·6"},{v:false,l:"LOW",e:"⬇",s:"1·2·3"}].map(c=>(
                  <button key={c.l} className={`btn choice${dHigh===c.v?" sel":""}`} style={{flexDirection:"column",gap:6,padding:"14px 10px"}} onClick={()=>setDHigh(c.v)} disabled={busy(dS)}>
                    <span style={{fontSize:22}}>{c.e}</span><span style={{fontSize:13}}>{c.l}</span><span style={{fontSize:10,color:"var(--sub)",fontWeight:400}}>{c.s}</span>
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
              {busy(dS)?<><Spin/>{dS==="approving"?"Approving...":dS==="placing"?"Placing...":"Rolling..."}</>:<span className="shimmer">{`ROLL $${dWager} → $${(parseFloat(dWager||0)*(dMode==="range"?1.94:5.82)).toFixed(2)}`}</span>}
            </button>
            <div style={{fontSize:10,color:"var(--dim)",textAlign:"center"}}>Pyth Entropy v2 · Provably fair · 3% house edge</div>
          </div>
        )}

        {tab==="leaderboard" && (
          <div className="fi" style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              {["volume","pnl"].map(s=>(
                <button key={s} className="btn" style={{background:lbSrt===s?"var(--blue)":"var(--s2)",border:`1px solid ${lbSrt===s?"var(--blue)":"var(--bd)"}`,color:lbSrt===s?"#fff":"var(--sub)",padding:"7px 14px",fontSize:12,borderRadius:8,width:"auto"}} onClick={()=>setLbSrt(s)}>{s==="volume"?"By Volume":"By PnL"}</button>
              ))}
              <button className="btn" style={{background:"var(--s2)",border:"1px solid var(--bd)",color:"var(--sub)",padding:"7px 14px",fontSize:12,borderRadius:8,width:"auto"}} onClick={fetchLb}>↻</button>
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
            <div style={{display:"flex",justifyContent:"space-between",padding:"0 4px"}}>
              <div style={{fontSize:10,color:"var(--dim)"}}>🏆 Top 10 · {lb.length} players</div>
              <div style={{fontSize:10,color:"var(--dim)"}}>Vol = total wagered · PnL = net profit</div>
            </div>
          </div>
        )}
      </main>

      <AppFooter style={{textAlign:"center",padding:"24px 20px",borderTop:"1px solid var(--bd)",marginTop:20}}>
        <div style={{fontSize:10,color:"var(--dim)",lineHeight:1.8}}>
          BaseCast · Pyth Entropy v2 · Base Network<br/>
          Gambling involves risk. 18+ only. Play responsibly.
        </div>
        <div style={{marginTop:12}}>
          <a href="https://t.me/Jeephoenix" target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(37,99,235,.1)",border:"1px solid rgba(37,99,235,.25)",borderRadius:8,padding:"7px 14px",fontSize:11,color:"var(--blue)",textDecoration:"none",fontFamily:"'Outfit',sans-serif"}}>
            💬 Feedback & Bug Reports
          </a>
        </div>
      </AppFooter>
    </div>
  );
         }
