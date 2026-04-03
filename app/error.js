"use client";

import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(125deg,#07050f 0%,#120a2e 30%,#0a1628 60%,#07050f 100%)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter',sans-serif", padding: "24px",
      textAlign: "center",
    }}>
      <img src="/logo.png" width={72} height={72} alt="BaseCast" style={{ borderRadius: 16, marginBottom: 24 }} />
      <div style={{
        fontSize: 14, fontWeight: 700, color: "#FF4D6D",
        letterSpacing: "2px", textTransform: "uppercase", marginBottom: 12,
      }}>Something went wrong</div>
      <div style={{ fontSize: 13, color: "#9094B0", marginBottom: 32, maxWidth: 300, lineHeight: 1.7 }}>
        An unexpected error occurred. Your funds and wallet are not affected.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          onClick={reset}
          style={{
            padding: "11px 24px", borderRadius: 10,
            background: "linear-gradient(135deg,#6C63FF,#4F46E5)",
            color: "#fff", fontWeight: 600, fontSize: 13,
            border: "none", cursor: "pointer", fontFamily: "'Inter',sans-serif",
          }}
        >
          Try Again
        </button>
        <a
          href="/"
          style={{
            display: "inline-flex", alignItems: "center",
            padding: "11px 24px", borderRadius: 10,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#9094B0", fontWeight: 600, fontSize: 13,
            textDecoration: "none", fontFamily: "'Inter',sans-serif",
          }}
        >
          Go Home
        </a>
      </div>
    </div>
  );
}
