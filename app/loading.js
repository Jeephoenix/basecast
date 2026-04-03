export default function Loading() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(125deg,#07050f 0%,#120a2e 30%,#0a1628 60%,#07050f 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 24,
    }}>

      {/* Spinning ring */}
      <div style={{ position: "relative", width: 72, height: 72 }}>
        <div style={{
          position: "absolute", inset: 0,
          borderRadius: "50%",
          border: "3px solid rgba(255,255,255,0.07)",
        }}/>
        <div style={{
          position: "absolute", inset: 0,
          borderRadius: "50%",
          border: "3px solid transparent",
          borderTopColor: "#6C63FF",
          borderRightColor: "#00F5A0",
          animation: "bc-spin 0.9s linear infinite",
        }}/>
      </div>

      {/* Wordmark */}
      <div style={{
        fontFamily: "'Orbitron', sans-serif",
        fontWeight: 900,
        fontSize: 22,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}>
        <span style={{
          background: "linear-gradient(180deg,#60C8FF 0%,#1A7FD4 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>BASE</span>
        <span style={{
          background: "linear-gradient(180deg,#FFD84D 0%,#E08C00 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>CAST</span>
      </div>

      <style>{`
        @keyframes bc-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
