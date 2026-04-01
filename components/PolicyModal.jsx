"use client";
// components/PolicyModal.jsx
// Privacy Policy + Terms of Service modal for BaseCast

import { useState } from "react";

const PRIVACY = `
PRIVACY POLICY
Last updated: March 2026

1. INFORMATION WE COLLECT
BaseCast is a decentralized application (dApp). We do not collect, store, or process any personal information on centralized servers. All interactions occur directly on the Base blockchain.

We may collect:
• Wallet addresses (public, on-chain)
• Transaction data (public, on-chain)
• Anonymous usage analytics (if enabled)

2. HOW WE USE INFORMATION
• To display your balance, bet history, and leaderboard stats
• To process game transactions via smart contracts
• We never sell, rent, or share your data with third parties

3. BLOCKCHAIN DATA
All bets, payouts, and wallet interactions are recorded permanently on the Base blockchain and are publicly visible. This is the nature of decentralized applications and cannot be reversed.

4. COOKIES
BaseCast uses localStorage only to store your wallet session signature. No tracking cookies are used.

5. THIRD PARTY SERVICES
• Pyth Network — provides on-chain randomness
• WalletConnect / RainbowKit — wallet connection
• Base Network — blockchain infrastructure
These services have their own privacy policies.

6. YOUR RIGHTS
Since we store no personal data on centralized servers, there is nothing to delete or export. Your on-chain activity is permanent by the nature of blockchain technology.

7. CONTACT
For privacy concerns, reach out via our official channels.
`;

const TERMS = `
TERMS OF SERVICE
Last updated: March 2026

PLEASE READ THESE TERMS CAREFULLY BEFORE USING BASECAST.

1. ACCEPTANCE OF TERMS
By accessing or using BaseCast, you agree to be bound by these Terms of Service. If you do not agree, do not use the platform.

2. ELIGIBILITY
You must be at least 18 years old (or the legal gambling age in your jurisdiction, whichever is higher) to use BaseCast. By using this platform you confirm you meet this requirement.

You may not use BaseCast if you are located in a jurisdiction where online gambling is prohibited, including but not limited to the United States, United Kingdom, France, and other restricted territories.

3. NATURE OF THE SERVICE
BaseCast is a decentralized, autonomous smart contract system deployed on the Base blockchain. The outcome of all games is determined by Pyth Network Entropy v2, a cryptographically verifiable randomness source. No human or entity can manipulate game outcomes.

4. RISK DISCLAIMER
Gambling involves substantial risk of loss. Only gamble with funds you can afford to lose entirely. Past outcomes do not predict future results. BaseCast holds no responsibility for any financial losses incurred through use of the platform.

5. SMART CONTRACT RISK
Interactions with BaseCast involve blockchain transactions that are irreversible. Smart contracts may contain bugs or vulnerabilities despite our best efforts. Use the platform at your own risk.

6. HOUSE EDGE
BaseCast operates with a 3% house edge on all games. This means over time, the house retains 3% of all wagered amounts. This is disclosed transparently and encoded immutably in the smart contracts.

7. NO WARRANTIES
BaseCast is provided "as is" without warranty of any kind. We do not guarantee uninterrupted access, error-free operation, or that the platform will meet your requirements.

8. LIMITATION OF LIABILITY
To the maximum extent permitted by law, BaseCast and its developers shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the platform.

9. PROHIBITED CONDUCT
You agree not to:
• Use the platform if you are in a restricted jurisdiction
• Attempt to exploit, hack, or manipulate the smart contracts
• Use automated bots or scripts to place bets
• Engage in money laundering or other illegal activities

10. CHANGES TO TERMS
We reserve the right to modify these Terms at any time. Continued use of the platform constitutes acceptance of updated Terms.

11. GOVERNING LAW
These Terms shall be governed by and construed in accordance with applicable decentralized finance regulations and the laws of the relevant jurisdiction.

12. CONTACT
For questions about these Terms, reach out via our official channels.
`;

const css = `
@keyframes modalFade {
  from { opacity:0; transform:translateY(16px) }
  to   { opacity:1; transform:translateY(0) }
}
.policy-overlay {
  position:fixed; inset:0; z-index:9999;
  background:rgba(4,6,12,0.92);
  backdrop-filter:blur(10px);
  display:flex; align-items:center; justify-content:center;
  padding:16px;
}
.policy-card {
  background:#0E1017;
  border:1px solid #1E2130;
  border-radius:16px;
  width:100%; max-width:580px;
  max-height:85vh;
  display:flex; flex-direction:column;
  animation:modalFade 0.25s ease;
  box-shadow:0 24px 80px rgba(0,0,0,0.7);
}
.policy-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:20px 24px 16px;
  border-bottom:1px solid #1E2130;
  flex-shrink:0;
}
.policy-tabs {
  display:flex;
  border-bottom:1px solid #1E2130;
  flex-shrink:0;
}
.policy-tab {
  flex:1; padding:12px; border:none; background:none;
  font-family:'Outfit',sans-serif; font-size:13px; font-weight:500;
  cursor:pointer; color:#6B7280; transition:all 0.15s;
  border-bottom:2px solid transparent;
}
.policy-tab.on { color:#F0F2F8; border-bottom-color:#2563EB; background:#080B12; }
.policy-body {
  overflow-y:auto; padding:20px 24px;
  flex:1;
}
.policy-body::-webkit-scrollbar { width:3px; }
.policy-body::-webkit-scrollbar-thumb { background:#2563EB; border-radius:2px; }
.policy-close {
  background:none; border:none; color:#6B7280;
  font-size:20px; cursor:pointer; padding:4px; line-height:1;
  transition:color 0.15s;
}
.policy-close:hover { color:#F0F2F8; }
`;

export function PolicyModal({ defaultTab = "privacy", onClose }) {
  const [tab, setTab] = useState(defaultTab);
  const content = tab === "privacy" ? PRIVACY : TERMS;

  return (
    <>
      <style>{css}</style>
      <div
        className="policy-overlay"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="policy-card">

          {/* Header */}
          <div className="policy-header">
            <div>
              <div style={{
                fontWeight: 700, fontSize: 16, color: "#F0F2F8",
                fontFamily: "'Outfit',sans-serif",
              }}>
                {tab === "privacy" ? "Privacy Policy" : "Terms of Service"}
              </div>
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                BaseCast · Last updated March 2026
              </div>
            </div>
            <button className="policy-close" onClick={onClose}>✕</button>
          </div>

          {/* Tabs */}
          <div className="policy-tabs">
            <button
              className={`policy-tab${tab === "privacy" ? " on" : ""}`}
              onClick={() => setTab("privacy")}
            >
              🔒 Privacy Policy
            </button>
            <button
              className={`policy-tab${tab === "terms" ? " on" : ""}`}
              onClick={() => setTab("terms")}
            >
              📋 Terms of Service
            </button>
          </div>

          {/* Content */}
          <div className="policy-body">
            {content.trim().split("\n").map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={i} style={{ height: 8 }} />;

              // Section headers (e.g. "1. ELIGIBILITY")
              if (/^\d+\./.test(trimmed) || trimmed === trimmed.toUpperCase() && trimmed.length > 3) {
                return (
                  <div key={i} style={{
                    fontWeight: 700, fontSize: 13,
                    color: "#F0F2F8", marginTop: 16, marginBottom: 6,
                    fontFamily: "'Outfit',sans-serif",
                    letterSpacing: "0.3px",
                  }}>
                    {trimmed}
                  </div>
                );
              }

              // Bullet points
              if (trimmed.startsWith("•")) {
                return (
                  <div key={i} style={{
                    fontSize: 12, color: "#9CA3AF", lineHeight: 1.7,
                    paddingLeft: 12, marginBottom: 2,
                    fontFamily: "'Outfit',sans-serif",
                  }}>
                    {trimmed}
                  </div>
                );
              }

              return (
                <div key={i} style={{
                  fontSize: 12, color: "#6B7280", lineHeight: 1.8,
                  marginBottom: 4, fontFamily: "'Outfit',sans-serif",
                }}>
                  {trimmed}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "14px 24px",
            borderTop: "1px solid #1E2130",
            display: "flex", justifyContent: "flex-end",
            flexShrink: 0,
          }}>
            <button
              onClick={onClose}
              style={{
                background: "#2563EB", color: "#fff", border: "none",
                borderRadius: 8, padding: "9px 24px",
                fontFamily: "'Outfit',sans-serif", fontSize: 13,
                fontWeight: 600, cursor: "pointer",
              }}
            >
              I Understand
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Consent gate — shown once before a user places their first bet ────────────
const CONSENT_KEY = "bc_consent_v1";
export function hasConsented() {
  try { return !!localStorage.getItem(CONSENT_KEY); } catch { return false; }
}

export function ConsentModal({ onAccept }) {
  const [agreedTerms,   setAgreedTerms]   = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [reading,       setReading]       = useState(null); // null | "terms" | "privacy"

  const canContinue = agreedTerms && agreedPrivacy;

  function accept() {
    try { localStorage.setItem(CONSENT_KEY, "1"); } catch {}
    onAccept();
  }

  if (reading) {
    return (
      <PolicyModal
        defaultTab={reading}
        onClose={() => setReading(null)}
      />
    );
  }

  return (
    <>
      <style>{css}</style>
      <div className="policy-overlay">
        <div className="policy-card" style={{ maxWidth: 520 }}>

          {/* Header */}
          <div className="policy-header">
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#F0F2F8", fontFamily: "'Outfit',sans-serif" }}>
                Before you play
              </div>
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                Please read and agree to continue
              </div>
            </div>
            <div style={{ fontSize: 28 }}>🎲</div>
          </div>

          {/* Body */}
          <div className="policy-body" style={{ padding: "24px" }}>
            <div style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.8, marginBottom: 24, fontFamily: "'Outfit',sans-serif" }}>
              BaseCast is a decentralised, provably fair on-chain casino running on the Base blockchain.
              All bets are irreversible blockchain transactions. Only play with funds you can afford to lose.
              You must be 18 years old or older (or the legal gambling age in your jurisdiction).
            </div>

            {/* Checkbox — Terms */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", marginBottom: 16, userSelect: "none" }}>
              <input
                type="checkbox"
                checked={agreedTerms}
                onChange={e => setAgreedTerms(e.target.checked)}
                style={{ width: 16, height: 16, marginTop: 2, accentColor: "#2563EB", flexShrink: 0, cursor: "pointer" }}
              />
              <span style={{ fontSize: 13, color: "#D1D5DB", lineHeight: 1.6, fontFamily: "'Outfit',sans-serif" }}>
                I have read and agree to the{" "}
                <button
                  onClick={() => setReading("terms")}
                  style={{ background: "none", border: "none", color: "#60A5FA", fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0, fontFamily: "'Outfit',sans-serif" }}
                >
                  Terms of Service
                </button>
              </span>
            </label>

            {/* Checkbox — Privacy */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={agreedPrivacy}
                onChange={e => setAgreedPrivacy(e.target.checked)}
                style={{ width: 16, height: 16, marginTop: 2, accentColor: "#2563EB", flexShrink: 0, cursor: "pointer" }}
              />
              <span style={{ fontSize: 13, color: "#D1D5DB", lineHeight: 1.6, fontFamily: "'Outfit',sans-serif" }}>
                I have read and agree to the{" "}
                <button
                  onClick={() => setReading("privacy")}
                  style={{ background: "none", border: "none", color: "#60A5FA", fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0, fontFamily: "'Outfit',sans-serif" }}
                >
                  Privacy Policy
                </button>
              </span>
            </label>
          </div>

          {/* Footer */}
          <div style={{ padding: "14px 24px", borderTop: "1px solid #1E2130", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
            <button
              onClick={accept}
              disabled={!canContinue}
              style={{
                background: canContinue ? "#2563EB" : "#1E2130",
                color: canContinue ? "#fff" : "#4B5563",
                border: "none", borderRadius: 8, padding: "10px 28px",
                fontFamily: "'Outfit',sans-serif", fontSize: 14,
                fontWeight: 600, cursor: canContinue ? "pointer" : "not-allowed",
                transition: "all 0.2s",
              }}
            >
              Continue to BaseCast
            </button>
          </div>

        </div>
      </div>
    </>
  );
}

// ── Floating feedback button — always visible above mobile nav ────────────────
export function FeedbackButton() {
  const [hovered, setHovered] = useState(false);
  return (
    <>
      <style>{`
        .feedback-fab {
          position: fixed;
          right: 18px;
          bottom: 80px;
          z-index: 200;
          display: flex;
          align-items: center;
          gap: 0;
          cursor: pointer;
          text-decoration: none;
          border-radius: 28px;
          background: linear-gradient(135deg, #3a3d4a, #2a2d38);
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 4px 20px rgba(0,0,0,0.5);
          padding: 0;
          overflow: hidden;
          max-width: 44px;
          transition: max-width 0.3s cubic-bezier(0.4,0,0.2,1), box-shadow 0.2s, transform 0.2s;
          white-space: nowrap;
        }
        .feedback-fab:hover, .feedback-fab.hovered {
          max-width: 200px;
          box-shadow: 0 6px 28px rgba(0,0,0,0.6);
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.22);
        }
        .feedback-fab-icon {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .feedback-fab-label {
          font-family: 'Outfit', sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: #fff;
          padding-right: 14px;
          opacity: 0;
          transition: opacity 0.2s 0.1s;
        }
        .feedback-fab:hover .feedback-fab-label,
        .feedback-fab.hovered .feedback-fab-label {
          opacity: 1;
        }
        @media (max-width: 520px) {
          .feedback-fab {
            bottom: 74px;
            right: 14px;
          }
        }
        @media (min-width: 521px) {
          .feedback-fab {
            bottom: 32px;
          }
        }
      `}</style>
      <a
        href="https://t.me/Jeephoenix"
        target="_blank"
        rel="noopener noreferrer"
        className={`feedback-fab${hovered ? " hovered" : ""}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title="Feedback & Bug Reports"
      >
        <span className="feedback-fab-icon">
          <svg width="23" height="23" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* body */}
            <ellipse cx="50" cy="57" rx="26" ry="30" fill="#b0b4c1"/>
            {/* head */}
            <ellipse cx="50" cy="26" rx="14" ry="13" fill="#b0b4c1"/>
            {/* wing split */}
            <line x1="50" y1="28" x2="50" y2="86" stroke="#2a2d38" strokeWidth="3.5" strokeLinecap="round"/>
            {/* antennae */}
            <line x1="43" y1="14" x2="30" y2="3" stroke="#b0b4c1" strokeWidth="4" strokeLinecap="round"/>
            <line x1="57" y1="14" x2="70" y2="3" stroke="#b0b4c1" strokeWidth="4" strokeLinecap="round"/>
            {/* legs left */}
            <line x1="24" y1="50" x2="7"  y2="44" stroke="#b0b4c1" strokeWidth="4" strokeLinecap="round"/>
            <line x1="24" y1="60" x2="6"  y2="62" stroke="#b0b4c1" strokeWidth="4" strokeLinecap="round"/>
            <line x1="25" y1="72" x2="10" y2="80" stroke="#b0b4c1" strokeWidth="4" strokeLinecap="round"/>
            {/* legs right */}
            <line x1="76" y1="50" x2="93" y2="44" stroke="#b0b4c1" strokeWidth="4" strokeLinecap="round"/>
            <line x1="76" y1="60" x2="94" y2="62" stroke="#b0b4c1" strokeWidth="4" strokeLinecap="round"/>
            <line x1="75" y1="72" x2="90" y2="80" stroke="#b0b4c1" strokeWidth="4" strokeLinecap="round"/>
            {/* circuit dots */}
            <circle cx="40" cy="52" r="4" fill="#2a2d38"/>
            <circle cx="40" cy="66" r="4" fill="#2a2d38"/>
            <circle cx="57" cy="59" r="4" fill="#2a2d38"/>
            {/* circuit lines */}
            <polyline points="40,52 34,58 40,66" stroke="#2a2d38" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="40" y1="59" x2="57" y2="59" stroke="#2a2d38" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </span>
        <span className="feedback-fab-label">Feedback &amp; Bugs</span>
      </a>
    </>
  );
}

// ── Footer component — drop this at the bottom of page.jsx ───────────────────
export function AppFooter() {
  const [modal, setModal] = useState(null); // null | "privacy" | "terms"

  return (
    <>
      {modal && (
        <PolicyModal defaultTab={modal} onClose={() => setModal(null)} />
      )}
      <FeedbackButton />
      <footer style={{
        textAlign: "center", padding: "24px 20px 90px",
        borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: 20,
      }}>
        <div style={{
          fontSize: 10, color: "#9094B0", lineHeight: 1.9,
          fontFamily: "'Outfit',sans-serif",
        }}>
          BaseCast · Pyth Network · Base
          <br />
          Gambling involves risk. 18+ only. Play responsibly.
          <br />
          <span style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
            <button
              onClick={() => setModal("privacy")}
              style={{
                background: "none", border: "none",
                color: "#6B7280", fontSize: 11,
                cursor: "pointer", textDecoration: "underline",
                fontFamily: "'Outfit',sans-serif",
                padding: 0,
              }}
            >
              Privacy Policy
            </button>
            <span style={{ color: "#6B7280" }}>·</span>
            <button
              onClick={() => setModal("terms")}
              style={{
                background: "none", border: "none",
                color: "#6B7280", fontSize: 11,
                cursor: "pointer", textDecoration: "underline",
                fontFamily: "'Outfit',sans-serif",
                padding: 0,
              }}
            >
              Terms of Service
            </button>
          </span>
        </div>
      </footer>
    </>
  );
}

