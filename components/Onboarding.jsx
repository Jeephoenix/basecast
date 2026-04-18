"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const steps = [
  {
    eyebrow: "Welcome to BaseCast",
    title: "Provably fair onchain casino games on Base",
    body: "Play Coin Flip, Dice Roll and Bingo with transparent on-chain outcomes, fast settlement and a premium wallet-first experience.",
    accent: "#60C8FF",
    badge: "Base chain",
    icon: (
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12h8" />
        <path d="M12 8v8" />
      </svg>
    ),
  },
  {
    eyebrow: "How fairness works",
    title: "Every result is verifiable",
    body: "BaseCast uses smart contracts and Pyth Entropy so game outcomes can be checked on-chain instead of being hidden behind a private server.",
    accent: "#00F5A0",
    badge: "Pyth Entropy",
    icon: (
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-5" />
      </svg>
    ),
  },
  {
    eyebrow: "Wallet-first security",
    title: "You stay in control",
    body: "Connect your wallet only when you are ready. BaseCast is non-custodial, so funds stay with you until you approve a game transaction.",
    accent: "#FFD166",
    badge: "Non-custodial",
    icon: (
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="15" rx="2" />
        <path d="M16 7V5a4 4 0 0 0-8 0v2" />
        <circle cx="17" cy="14" r="1.4" />
      </svg>
    ),
  },
  {
    eyebrow: "Ready to play",
    title: "Connect, verify and choose a game",
    body: "After connecting, sign a free message to verify wallet ownership, pick your game, choose a USDC wager and track results instantly.",
    accent: "#6C63FF",
    badge: "USDC games",
    icon: (
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2 3 14h8l-1 8 11-13h-8l0-7z" />
      </svg>
    ),
  },
];

export default function Onboarding({ onSkip, onComplete }) {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const isLast = step === steps.length - 1;

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  return (
    <div className="bc-onboarding" role="dialog" aria-modal="true" aria-label="BaseCast onboarding">
      <style>{`
        .bc-onboarding{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;width:100vw;min-height:100vh;min-height:100dvh;padding:22px;background:#050611;overflow:hidden;isolation:isolate}
        .bc-onboarding::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 16% 8%,rgba(96,200,255,.20),transparent 34%),radial-gradient(circle at 88% 16%,rgba(255,209,102,.17),transparent 32%),radial-gradient(circle at 50% 100%,rgba(108,99,255,.18),transparent 38%),linear-gradient(155deg,#050611 0%,#090821 46%,#040812 100%);z-index:0}
        .bc-onboarding::after{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:56px 56px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.75),transparent 78%);z-index:0;pointer-events:none}
        .bc-onboarding-card{position:relative;z-index:1;width:min(94vw,560px);overflow:hidden;border:1px solid rgba(255,255,255,.15);border-radius:32px;background:linear-gradient(150deg,rgba(15,18,38,.98),rgba(7,8,21,.99));box-shadow:0 32px 100px rgba(0,0,0,.72),0 0 100px rgba(108,99,255,.18);animation:bcPanelIn .34s ease both}
        .bc-orb{position:absolute;border-radius:999px;filter:blur(4px);opacity:.75;pointer-events:none;animation:bcFloat 5s ease-in-out infinite}
        .bc-orb.one{width:230px;height:230px;left:-92px;top:-86px;background:radial-gradient(circle,rgba(96,200,255,.30),transparent 70%)}
        .bc-orb.two{width:210px;height:210px;right:-90px;bottom:7%;background:radial-gradient(circle,rgba(255,209,102,.22),transparent 70%);animation-delay:1.2s}
        .bc-onboarding-body{position:relative;z-index:1;padding:30px}
        .bc-logo-ring{width:92px;height:92px;margin:2px auto 18px;border-radius:28px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(96,200,255,.20),rgba(108,99,255,.19),rgba(255,209,102,.18));border:1px solid rgba(255,255,255,.18);box-shadow:0 0 44px rgba(108,99,255,.30);animation:bcPulse 3s ease-in-out infinite}
        .bc-step-visual{width:82px;height:82px;margin:0 auto 22px;border-radius:26px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);box-shadow:inset 0 0 32px rgba(255,255,255,.04)}
        .bc-step-copy{animation:bcSlide .24s ease both;text-align:center}
        .bc-eyebrow{font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#9094B0;font-weight:800;margin-bottom:10px}
        .bc-title{font-size:clamp(27px,6vw,40px);line-height:1.02;color:#F0F2FF;font-weight:900;letter-spacing:-.045em;margin-bottom:13px}
        .bc-body{font-size:14px;line-height:1.75;color:#AAB0CC;max-width:430px;margin:0 auto}
        .bc-badge-row{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin:22px 0 18px}
        .bc-badge{display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);color:#DDE2FF;font-size:11px;font-weight:700}
        .bc-dot{width:7px;height:7px;border-radius:999px;background:#3D4060;transition:all .22s ease}
        .bc-dot.on{width:24px;background:linear-gradient(90deg,#60C8FF,#6C63FF,#FFD166);box-shadow:0 0 16px rgba(108,99,255,.55)}
        .bc-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:22px}
        .bc-btn{border:none;border-radius:14px;padding:13px 15px;cursor:pointer;font-family:'Inter',sans-serif;font-size:14px;font-weight:800;transition:transform .16s ease,box-shadow .16s ease,background .16s ease}
        .bc-btn:hover{transform:translateY(-1px)}
        .bc-btn.secondary{background:rgba(255,255,255,.075);border:1px solid rgba(255,255,255,.12);color:#C7CBDF}
        .bc-btn.primary{color:white;background:linear-gradient(135deg,#6C63FF,#2563EB);box-shadow:0 12px 34px rgba(108,99,255,.36)}
        .bc-btn.ghost{background:transparent;color:#9094B0;padding:8px 10px}
        .bc-topline{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
        @keyframes bcPanelIn{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes bcSlide{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:translateX(0)}}
        @keyframes bcFloat{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(12px,-10px,0) scale(1.07)}}
        @keyframes bcPulse{0%,100%{transform:translateY(0);box-shadow:0 0 34px rgba(108,99,255,.24)}50%{transform:translateY(-4px);box-shadow:0 0 48px rgba(96,200,255,.36)}}
        @media(max-width:520px){.bc-onboarding{align-items:center;padding:14px}.bc-onboarding-card{width:100%;border-radius:28px}.bc-onboarding-body{padding:22px}.bc-actions{grid-template-columns:1fr}.bc-logo-ring{width:78px;height:78px;border-radius:24px}.bc-step-visual{width:70px;height:70px;border-radius:22px}.bc-title{font-size:29px}.bc-body{font-size:13px}.bc-badge-row{margin:18px 0 16px}.bc-topline{margin-bottom:14px}}
      `}</style>
      <div className="bc-onboarding-card">
        <div className="bc-orb one" />
        <div className="bc-orb two" />
        <div className="bc-onboarding-body">
          <div className="bc-topline">
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <img src="/logo.png" width={36} height={36} alt="BaseCast" style={{borderRadius:10,objectFit:"cover"}} />
              <div style={{fontFamily:"'Orbitron',sans-serif",fontWeight:900,fontSize:13,letterSpacing:".08em"}}>
                <span style={{background:"linear-gradient(180deg,#60C8FF,#1A7FD4)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>BASE</span>
                <span style={{background:"linear-gradient(180deg,#FFD84D,#E08C00)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>CAST</span>
              </div>
            </div>
            <button className="bc-btn ghost" onClick={onSkip}>Skip</button>
          </div>

          <div className="bc-logo-ring">
            <div className="bc-step-visual" style={{color:current.accent}}>
              {current.icon}
            </div>
          </div>

          <div key={step} className="bc-step-copy">
            <div className="bc-eyebrow">{current.eyebrow}</div>
            <div className="bc-title">{current.title}</div>
            <div className="bc-body">{current.body}</div>
          </div>

          <div className="bc-badge-row">
            <span className="bc-badge"><span style={{width:7,height:7,borderRadius:"50%",background:current.accent,boxShadow:`0 0 12px ${current.accent}`}} />{current.badge}</span>
            <span className="bc-badge">18+ · Play responsibly</span>
          </div>

          <div style={{display:"flex",justifyContent:"center",gap:7}}>
            {steps.map((_, i) => <span key={i} className={`bc-dot${i === step ? " on" : ""}`} />)}
          </div>

          <div className="bc-actions">
            <button className="bc-btn secondary" onClick={() => step === 0 ? onSkip() : setStep(step - 1)}>
              {step === 0 ? "Skip" : "Back"}
            </button>
            {isLast ? (
              <ConnectButton.Custom>
                {({ openConnectModal, mounted }) => mounted && (
                  <button className="bc-btn primary" onClick={() => { onComplete(); openConnectModal(); }}>
                    Connect Wallet
                  </button>
                )}
              </ConnectButton.Custom>
            ) : (
              <button className="bc-btn primary" onClick={() => setStep(step + 1)}>
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
