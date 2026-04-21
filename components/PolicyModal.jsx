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
  font-family:'Inter',sans-serif; font-size:13px; font-weight:500;
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
                fontFamily: "'Inter',sans-serif",
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
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Privacy Policy
            </button>
            <button
              className={`policy-tab${tab === "terms" ? " on" : ""}`}
              onClick={() => setTab("terms")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Terms of Service
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
                    fontFamily: "'Inter',sans-serif",
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
                    fontFamily: "'Inter',sans-serif",
                  }}>
                    {trimmed}
                  </div>
                );
              }

              return (
                <div key={i} style={{
                  fontSize: 12, color: "#6B7280", lineHeight: 1.8,
                  marginBottom: 4, fontFamily: "'Inter',sans-serif",
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
                fontFamily: "'Inter',sans-serif", fontSize: 13,
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
              <div style={{ fontWeight: 700, fontSize: 16, color: "#F0F2F8", fontFamily: "'Inter',sans-serif" }}>
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
            <div style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.8, marginBottom: 24, fontFamily: "'Inter',sans-serif" }}>
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
              <span style={{ fontSize: 13, color: "#D1D5DB", lineHeight: 1.6, fontFamily: "'Inter',sans-serif" }}>
                I have read and agree to the{" "}
                <button
                  onClick={() => setReading("terms")}
                  style={{ background: "none", border: "none", color: "#60A5FA", fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0, fontFamily: "'Inter',sans-serif" }}
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
              <span style={{ fontSize: 13, color: "#D1D5DB", lineHeight: 1.6, fontFamily: "'Inter',sans-serif" }}>
                I have read and agree to the{" "}
                <button
                  onClick={() => setReading("privacy")}
                  style={{ background: "none", border: "none", color: "#60A5FA", fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 0, fontFamily: "'Inter',sans-serif" }}
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
                fontFamily: "'Inter',sans-serif", fontSize: 14,
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

// ── Feedback modal ────────────────────────────────────────────────────────────
function FeedbackModal({ onClose }) {
  const [type,    setType]    = useState("feedback");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [status,  setStatus]  = useState("idle"); // idle | sending | sent | error

  async function submit() {
    if (!subject.trim() || !message.trim()) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, subject: subject.trim(), message: message.trim(), contact: contact.trim() }),
      });
      const json = await res.json();
      setStatus(json.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  const types = [
    {
      id: "bug", label: "Bug Report",
      icon: (active) => (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={active ? "#F0F2F8" : "#6B7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22c-4.97 0-9-3.58-9-8v-1l2-4h14l2 4v1c0 4.42-4.03 8-9 8z"/>
          <path d="M12 14v4M9 10V7a3 3 0 0 1 6 0v3"/>
          <path d="M3 13h3M18 13h3M5 7l2 2M17 7l2-2"/>
        </svg>
      ),
    },
    {
      id: "feedback", label: "Feedback",
      icon: (active) => (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={active ? "#F0F2F8" : "#6B7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
    },
    {
      id: "suggestion", label: "Suggestion",
      icon: (active) => (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={active ? "#F0F2F8" : "#6B7280"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
          <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
        </svg>
      ),
    },
  ];

  return (
    <>
      <style>{css}</style>
      <div className="policy-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="policy-card" style={{ maxWidth: 480 }}>

          <div className="policy-header">
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#F0F2F8", fontFamily: "'Inter',sans-serif" }}>
                Bugs &amp; Feedback
              </div>
              <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                We read every submission
              </div>
            </div>
            <button className="policy-close" onClick={onClose}>✕</button>
          </div>

          <div className="policy-body" style={{ padding: "20px 24px" }}>
            {status === "sent" ? (
              <div style={{ textAlign: "center", padding: "32px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(0,245,160,0.12)", border: "1.5px solid rgba(0,245,160,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00F5A0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#F0F2F8", fontFamily: "'Inter',sans-serif" }}>Thanks for your feedback!</div>
                <div style={{ fontSize: 13, color: "#6B7280", fontFamily: "'Inter',sans-serif" }}>We'll look into it and get back to you if needed.</div>
                <button onClick={onClose} style={{ marginTop: 8, background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, padding: "10px 28px", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Close</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 8, fontFamily: "'Inter',sans-serif", fontWeight: 600, letterSpacing: "0.5px" }}>TYPE</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {types.map(t => {
                      const active = type === t.id;
                      return (
                        <button key={t.id} onClick={() => setType(t.id)} style={{
                          flex: 1, padding: "8px 6px", borderRadius: 8, border: `1.5px solid ${active ? "#2563EB" : "#1E2130"}`,
                          background: active ? "rgba(37,99,235,0.15)" : "#080B12",
                          color: active ? "#F0F2F8" : "#6B7280",
                          fontFamily: "'Inter',sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                        }}>
                          {t.icon(active)}
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6, fontFamily: "'Inter',sans-serif", fontWeight: 600, letterSpacing: "0.5px" }}>SUBJECT</div>
                  <input
                    value={subject} onChange={e => setSubject(e.target.value)}
                    placeholder="Brief summary..."
                    style={{ width: "100%", background: "#080B12", border: "1.5px solid #1E2130", borderRadius: 8, color: "#F0F2F8", fontFamily: "'Inter',sans-serif", fontSize: 13, padding: "10px 12px", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => e.target.style.borderColor = "#2563EB"}
                    onBlur={e => e.target.style.borderColor = "#1E2130"}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6, fontFamily: "'Inter',sans-serif", fontWeight: 600, letterSpacing: "0.5px" }}>MESSAGE</div>
                  <textarea
                    value={message} onChange={e => setMessage(e.target.value)}
                    placeholder="Describe the issue or your feedback in detail..."
                    rows={5}
                    style={{ width: "100%", background: "#080B12", border: "1.5px solid #1E2130", borderRadius: 8, color: "#F0F2F8", fontFamily: "'Inter',sans-serif", fontSize: 13, padding: "10px 12px", outline: "none", resize: "vertical", boxSizing: "border-box" }}
                    onFocus={e => e.target.style.borderColor = "#2563EB"}
                    onBlur={e => e.target.style.borderColor = "#1E2130"}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 6, fontFamily: "'Inter',sans-serif", fontWeight: 600, letterSpacing: "0.5px" }}>CONTACT <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional — email or Telegram)</span></div>
                  <input
                    value={contact} onChange={e => setContact(e.target.value)}
                    placeholder="So we can follow up if needed"
                    style={{ width: "100%", background: "#080B12", border: "1.5px solid #1E2130", borderRadius: 8, color: "#F0F2F8", fontFamily: "'Inter',sans-serif", fontSize: 13, padding: "10px 12px", outline: "none", boxSizing: "border-box" }}
                    onFocus={e => e.target.style.borderColor = "#2563EB"}
                    onBlur={e => e.target.style.borderColor = "#1E2130"}
                  />
                </div>

                {status === "error" && (
                  <div style={{ fontSize: 12, color: "#EF4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 14px", fontFamily: "'Inter',sans-serif" }}>
                    Something went wrong. Please try again.
                  </div>
                )}
              </div>
            )}
          </div>

          {status !== "sent" && (
            <div style={{ padding: "14px 24px", borderTop: "1px solid #1E2130", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0 }}>
              <button onClick={onClose} style={{ background: "none", border: "1px solid #1E2130", color: "#6B7280", borderRadius: 8, padding: "9px 20px", fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button
                onClick={submit}
                disabled={status === "sending" || !subject.trim() || !message.trim()}
                style={{
                  background: status === "sending" || !subject.trim() || !message.trim() ? "#1E2130" : "#2563EB",
                  color: status === "sending" || !subject.trim() || !message.trim() ? "#4B5563" : "#fff",
                  border: "none", borderRadius: 8, padding: "9px 24px",
                  fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600,
                  cursor: status === "sending" || !subject.trim() || !message.trim() ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                }}
              >
                {status === "sending" ? "Sending..." : "Send Feedback"}
              </button>
            </div>
          )}

        </div>
      </div>
    </>
  );
}

// ── Floating feedback button — always visible above mobile nav ────────────────
export function FeedbackButton() {
  const [hovered, setHovered] = useState(false);
  const [open,    setOpen]    = useState(false);

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
          width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .feedback-fab-label {
          font-family: 'Inter', sans-serif;
          font-size: 13px; font-weight: 600; color: #fff;
          padding-right: 14px; opacity: 0;
          transition: opacity 0.2s 0.1s;
        }
        .feedback-fab:hover .feedback-fab-label,
        .feedback-fab.hovered .feedback-fab-label { opacity: 1; }
        @media (max-width: 520px) { .feedback-fab { bottom: 74px; right: 14px; } }
        @media (min-width: 521px) { .feedback-fab { bottom: 32px; } }
      `}</style>

      {open && <FeedbackModal onClose={() => setOpen(false)} />}

      <button
        className={`feedback-fab${hovered ? " hovered" : ""}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => setOpen(true)}
        title="Feedback & Bug Reports"
      >
        <span className="feedback-fab-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b0b4c1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </span>
        <span className="feedback-fab-label">Feedback &amp; Bugs</span>
      </button>
    </>
  );
}

// ── Footer component — drop this at the bottom of page.jsx ───────────────────
const IcoX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const IcoTelegram = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const IcoGlobe = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

export function AppFooter() {
  const [modal, setModal] = useState(null);
  const year = new Date().getFullYear();

  return (
    <>
      {modal && (
        <PolicyModal defaultTab={modal} onClose={() => setModal(null)} />
      )}
      <FeedbackButton />
      <footer style={{
        textAlign: "center", padding: "28px 20px 96px",
        borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 24,
      }}>
        <div style={{ fontFamily: "'Inter',sans-serif" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 16 }}>
            <a
              href="https://x.com/basecast_"
              target="_blank"
              rel="noopener noreferrer"
              title="X / Twitter"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 34, borderRadius: 9,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#9094B0", textDecoration: "none",
              }}
            >
              <IcoX />
            </a>
            <a
              href="https://t.me/base_cast"
              target="_blank"
              rel="noopener noreferrer"
              title="Telegram"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 34, borderRadius: 9,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#9094B0", textDecoration: "none",
                transition: "all .15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(108,99,255,0.5)"; e.currentTarget.style.color = "#F0F2FF"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#9094B0"; }}
            >
              <IcoTelegram />
            </a>
            <a
              href="https://www.basecast.org"
              target="_blank"
              rel="noopener noreferrer"
              title="Website"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 34, borderRadius: 9,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#9094B0", textDecoration: "none",
                transition: "all .15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(108,99,255,0.5)"; e.currentTarget.style.color = "#F0F2FF"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#9094B0"; }}
            >
              <IcoGlobe />
            </a>
          </div>

          <div style={{ fontSize: 10, color: "#6B7280", marginBottom: 10 }}>
            Gambling involves risk. 18+ only. Play responsibly.
          </div>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", alignItems: "center", marginBottom: 12 }}>
            <button
              onClick={() => setModal("privacy")}
              style={{
                background: "none", border: "none",
                color: "#6B7280", fontSize: 11,
                cursor: "pointer", textDecoration: "underline",
                fontFamily: "'Inter',sans-serif", padding: 0,
              }}
            >
              Privacy Policy
            </button>
            <span style={{ color: "#3D4060" }}>·</span>
            <button
              onClick={() => setModal("terms")}
              style={{
                background: "none", border: "none",
                color: "#6B7280", fontSize: 11,
                cursor: "pointer", textDecoration: "underline",
                fontFamily: "'Inter',sans-serif", padding: 0,
              }}
            >
              Terms of Service
            </button>
          </div>

          <div style={{ fontSize: 10, color: "#3D4060" }}>
            © {year} BaseCast. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
}

