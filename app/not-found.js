"use client";

export default function NotFound() {
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
        fontFamily: "'Orbitron',sans-serif", fontWeight: 900,
        fontSize: "clamp(48px,12vw,80px)", lineHeight: 1,
        background: "linear-gradient(180deg,#60C8FF 0%,#1A7FD4 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text", marginBottom: 8,
      }}>404</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "#F0F2FF", marginBottom: 10 }}>
        Page Not Found
      </div>
      <div style={{ fontSize: 13, color: "#9094B0", marginBottom: 32, maxWidth: 280, lineHeight: 1.7 }}>
        This page doesn&apos;t exist or has been moved. Head back to the casino floor.
      </div>
      <a
        href="/"
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "12px 28px", borderRadius: 10,
          background: "linear-gradient(135deg,#6C63FF,#4F46E5)",
          color: "#fff", fontWeight: 600, fontSize: 14,
          textDecoration: "none", fontFamily: "'Inter',sans-serif",
        }}
      >
        Back to BaseCast
      </a>
    </div>
  );
}
