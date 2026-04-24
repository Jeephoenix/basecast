import { ImageResponse } from "next/og";

export const alt = "BaseCast — Provably Fair Casino on Base";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "edge";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background:
            "radial-gradient(circle at 18% 15%, rgba(96,200,255,0.28), transparent 38%), radial-gradient(circle at 82% 85%, rgba(255,209,102,0.22), transparent 42%), linear-gradient(155deg,#050611 0%,#0a0a24 50%,#040812 100%)",
          color: "#F0F2FF",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: "linear-gradient(135deg,#6C63FF,#4F46E5 60%,#FFD166)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 40,
              fontWeight: 900,
              letterSpacing: -2,
            }}
          >
            BC
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 1, color: "#60C8FF" }}>BASE</div>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 1, color: "#FFD166", marginTop: -8 }}>CAST</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1.05, maxWidth: 980 }}>
            Provably fair onchain casino on Base
          </div>
          <div style={{ fontSize: 30, color: "#9094B0", maxWidth: 920, lineHeight: 1.3 }}>
            Coin Flip · Dice Roll · Bingo — instant USDC payouts, every result verifiable via Pyth Entropy.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 22, color: "#9094B0" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#00F5A0", boxShadow: "0 0 14px #00F5A0" }} />
            Base Mainnet · Non-custodial
          </div>
          <div style={{ color: "#FFD166", fontWeight: 700 }}>basecast.org</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
