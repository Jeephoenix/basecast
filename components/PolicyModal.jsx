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

// ── Footer component — drop this at the bottom of page.jsx ───────────────────
export function AppFooter() {
  const [modal, setModal] = useState(null); // null | "privacy" | "terms"

  return (
    <>
      {modal && (
        <PolicyModal defaultTab={modal} onClose={() => setModal(null)} />
      )}
      <footer style={{
        textAlign: "center", padding: "24px 20px",
        borderTop: "1px solid #1E2130", marginTop: 20,
      }}>
        <div style={{
          fontSize: 10, color: "#374151", lineHeight: 1.9,
          fontFamily: "'Outfit',sans-serif",
        }}>
          BaseCast · Pyth Entropy v2 · Base Network
          <br />
          Gambling involves risk. 18+ only. Play responsibly.
          <br />
          <span style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
            <button
              onClick={() => setModal("privacy")}
              style={{
                background: "none", border: "none",
                color: "#4B5563", fontSize: 11,
                cursor: "pointer", textDecoration: "underline",
                fontFamily: "'Outfit',sans-serif",
                padding: 0,
              }}
            >
              Privacy Policy
            </button>
            <span style={{ color: "#1F2937" }}>·</span>
            <button
              onClick={() => setModal("terms")}
              style={{
                background: "none", border: "none",
                color: "#4B5563", fontSize: 11,
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
