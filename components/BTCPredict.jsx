"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL      = "wss://stream.binance.com:9443/ws/btcusdt@aggTrade";
const POLL_MS     = 3000;
const MAX_HIST    = 80;
const HOUSE_EDGE  = 0.03;
const MIN_BET     = 1;
const MAX_BET     = 500;

function mult(myPool, totalPool) {
  if (!myPool || !totalPool || myPool <= 0) return "—";
  const net = totalPool * (1 - HOUSE_EDGE);
  const m   = net / myPool;
  return m < 1 ? "1.00" : m.toFixed(2);
}
function fmt(p)  { return p != null ? p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–"; }
function usd(n)  { return `$${(n ?? 0).toFixed(2)}`; }

// ── Sparkline ──────────────────────────────────────────────────────────────────
function Sparkline({ prices, openPrice }) {
  if (prices.length < 2) {
    return (
      <div style={{ height: 88, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)", fontSize: 11 }}>
        Collecting data…
      </div>
    );
  }
  const W = 480, H = 88, PAD = 6;
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = max - min || 0.01;
  const x = (i) => (i / (prices.length - 1)) * W;
  const y = (p) => H - PAD - ((p - min) / range) * (H - PAD * 2);

  const linePts = prices.map((p, i) => `${x(i)},${y(p)}`).join(" ");
  const fillPts = `0,${H} ${linePts} ${W},${H}`;

  const last      = prices[prices.length - 1];
  const isUp      = openPrice != null ? last >= openPrice : last >= prices[0];
  const stroke    = isUp ? "#00F5A0" : "#FF4D4D";
  const fillStart = isUp ? "rgba(0,245,160,0.18)" : "rgba(255,77,77,0.18)";

  const baseY = openPrice != null && max !== min
    ? y(Math.min(Math.max(openPrice, min), max))
    : null;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="spFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={fillStart} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>
      {baseY != null && (
        <line x1={0} y1={baseY} x2={W} y2={baseY}
          stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="5 4" />
      )}
      <polygon points={fillPts} fill="url(#spFill)" />
      <polyline points={linePts} fill="none" stroke={stroke} strokeWidth="2.2"
        strokeLinejoin="round" strokeLinecap="round" />
      {/* Last price dot */}
      <circle cx={x(prices.length - 1)} cy={y(last)} r="4" fill={stroke} />
    </svg>
  );
}

// ── Countdown ring ─────────────────────────────────────────────────────────────
function Ring({ closeTime, phase }) {
  const [rem, setRem] = useState(60);
  useEffect(() => {
    const tick = () => setRem(Math.max(0, Math.ceil((new Date(closeTime) - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [closeTime]);

  const R = 26, C = 2 * Math.PI * R;
  const dash = C * (rem / 60);
  const urgent = rem <= 10;
  const color  = phase === "locked" ? "#FF4D4D" : urgent ? "#FFD166" : "#6C63FF";

  return (
    <div style={{ position: "relative", width: 68, height: 68, flexShrink: 0 }}>
      <svg width={68} height={68} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={34} cy={34} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={5} />
        <circle cx={34} cy={34} r={R} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${dash} ${C}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray .25s linear, stroke .3s" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{rem}</div>
        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", letterSpacing: "0.5px", marginTop: 1 }}>SEC</div>
      </div>
    </div>
  );
}

// ── Pool bar ──────────────────────────────────────────────────────────────────
function PoolBar({ upPct }) {
  return (
    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,77,77,0.5)", overflow: "hidden", margin: "10px 0" }}>
      <div style={{ height: "100%", width: `${upPct}%`, background: "#00F5A0", borderRadius: 2, transition: "width 0.6s ease" }} />
    </div>
  );
}

// ── Result flash ──────────────────────────────────────────────────────────────
function ResultFlash({ result, onDone }) {
  useEffect(() => { const id = setTimeout(onDone, 3800); return () => clearTimeout(id); }, [onDone]);
  const won   = result.won;
  const color = won ? "#00F5A0" : "#FF4D4D";
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{
        background: "var(--s2)", border: `2px solid ${color}`, borderRadius: 22,
        padding: "36px 56px", textAlign: "center",
        boxShadow: `0 0 80px ${won ? "rgba(0,245,160,.35)" : "rgba(255,77,77,.35)"}`,
        animation: "fi .25s ease",
      }}>
        <div style={{ fontSize: 48, marginBottom: 6 }}>{won ? "🎉" : "😞"}</div>
        <div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: "'JetBrains Mono',monospace" }}>
          {won ? `+${usd(result.payout)}` : `-${usd(result.wager)}`}
        </div>
        <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 8 }}>
          {won ? "Correct prediction!" : "Better luck next round"}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BTCPredict({ address }) {
  const [price,        setPrice]        = useState(null);
  const [prevPrice,    setPrevPrice]    = useState(null);
  const [priceHist,    setPriceHist]    = useState([]);
  const [round,        setRound]        = useState(null);
  const [history,      setHistory]      = useState([]);
  const [side,         setSide]         = useState("up");
  const [wager,        setWager]        = useState("10");
  const [betting,      setBetting]      = useState(false);
  const [betErr,       setBetErr]       = useState(null);
  const [flashResult,  setFlashResult]  = useState(null);
  const prevRoundId    = useRef(null);
  const prevMyBet      = useRef(null);

  // ── WebSocket live price ──────────────────────────────────────────────────
  useEffect(() => {
    let ws, timer;
    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          const p = parseFloat(d.p);
          if (isNaN(p)) return;
          setPrice(prev => { setPrevPrice(prev); return p; });
          setPriceHist(prev => {
            const next = [...prev, p];
            return next.length > MAX_HIST ? next.slice(-MAX_HIST) : next;
          });
        } catch {}
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => { timer = setTimeout(connect, 3000); };
    };
    connect();
    return () => { ws?.close(); clearTimeout(timer); };
  }, []);

  // ── Poll round state ──────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const res  = await fetch(`/api/predict${address ? `?address=${encodeURIComponent(address)}` : ""}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.round) return;

      // Detect when a round we bet on just settled → show flash
      if (prevRoundId.current && data.round.id !== prevRoundId.current && prevMyBet.current) {
        const settled = data.history.find(h => h.id === prevRoundId.current);
        if (settled) {
          const won    = settled.result === prevMyBet.current.side;
          const myPool = settled.result === "up" ? settled.upPool : settled.downPool;
          const total  = settled.upPool + settled.downPool;
          const m      = parseFloat(mult(myPool, total));
          setFlashResult({
            won,
            payout: won ? prevMyBet.current.amount * m : 0,
            wager:  prevMyBet.current.amount,
          });
        }
      }

      prevRoundId.current = data.round.id;
      prevMyBet.current   = data.round.myBet;
      setRound(data.round);
      setHistory(data.history);
    } catch {}
  }, [address]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  // ── Place bet ─────────────────────────────────────────────────────────────
  const placeBet = async () => {
    if (!round || round.phase !== "open" || round.myBet) return;
    const amt = parseFloat(wager);
    if (isNaN(amt) || amt < MIN_BET || amt > MAX_BET) {
      setBetErr(`Amount must be $${MIN_BET}–$${MAX_BET}`);
      return;
    }
    setBetting(true);
    setBetErr(null);
    try {
      const res  = await fetch("/api/predict", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ address, side, amount: amt, roundId: round.id }),
      });
      const data = await res.json();
      if (!data.ok) setBetErr(data.error || "Failed to place bet");
      else await poll();
    } catch { setBetErr("Network error. Try again."); }
    setBetting(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const upPool   = round?.upPool   ?? 0;
  const downPool = round?.downPool ?? 0;
  const total    = upPool + downPool;
  const upMult   = mult(upPool,   total);
  const downMult = mult(downPool, total);
  const upPct    = total > 0 ? (upPool / total) * 100 : 50;
  const priceDir = price != null && round?.openPrice != null
    ? price >= round.openPrice ? "up" : "down"
    : "up";
  const priceChange = price != null && round?.openPrice != null ? price - round.openPrice : null;

  const phaseColor = round?.phase === "open"   ? "#00F5A0"
                   : round?.phase === "locked" ? "#FF4D4D"
                   : "#6C63FF";
  const phaseLabel = round?.phase === "open"   ? "● OPEN"
                   : round?.phase === "locked" ? "🔒 LOCKED"
                   : "✓ SETTLED";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── Live price card ─────────────────────────────────────────── */}
      <div className="card" style={{ padding: "18px 18px 14px", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: priceDir === "up"
            ? "radial-gradient(ellipse at 50% -10%, rgba(0,245,160,.08), transparent 65%)"
            : "radial-gradient(ellipse at 50% -10%, rgba(255,77,77,.08), transparent 65%)",
        }} />

        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(247,147,26,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#F7931A" strokeWidth="2"/>
                <path d="M9 8h4.5a2 2 0 0 1 0 4H9m0 0h5a2 2 0 0 1 0 4H9M9 8V7m0 9v1M12 8V7m0 9v1"
                  stroke="#F7931A" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--tx)" }}>BTC / USD</div>
              <div style={{ fontSize: 9, color: "var(--sub)", letterSpacing: "1.5px" }}>BINANCE LIVE</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#00F5A0", fontWeight: 600 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00F5A0",
              boxShadow: "0 0 6px #00F5A0", animation: "pulse 1.5s infinite" }} />
            LIVE
          </div>
        </div>

        {/* Price */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginBottom: 14 }}>
          <div style={{
            fontFamily: "'JetBrains Mono',monospace", fontWeight: 800, fontSize: 32,
            color: "var(--tx)", lineHeight: 1,
            transition: "color .2s",
          }}>
            ${fmt(price)}
          </div>
          {priceChange != null && (
            <div style={{
              fontSize: 13, fontWeight: 700, paddingBottom: 3,
              color: priceChange >= 0 ? "#00F5A0" : "#FF4D4D",
            }}>
              {priceChange >= 0 ? "▲" : "▼"} ${Math.abs(priceChange).toFixed(2)}
            </div>
          )}
          {prevPrice != null && price != null && (
            <div style={{
              marginLeft: "auto", fontSize: 10, color: "var(--sub)",
              paddingBottom: 4,
            }}>
              prev ${fmt(prevPrice)}
            </div>
          )}
        </div>

        {/* Chart */}
        <div style={{ borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Sparkline prices={priceHist} openPrice={round?.openPrice} />
        </div>
      </div>

      {/* ── Round status ─────────────────────────────────────────────── */}
      {round && (
        <div className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 14 }}>
          <Ring closeTime={round.closeTime} phase={round.phase} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "1px", padding: "3px 9px",
                borderRadius: 5, background: `${phaseColor}18`, color: phaseColor,
              }}>
                {phaseLabel}
              </div>
              <div style={{ fontSize: 10, color: "var(--dim)" }}>Round #{round.id}</div>
            </div>
            <div style={{ fontSize: 11, color: "var(--sub)", lineHeight: 1.5 }}>
              {round.phase === "open" && <>Bet closes in ~10s · Entry <span style={{ color: "var(--tx)", fontWeight: 600 }}>${fmt(round.openPrice)}</span></>}
              {round.phase === "locked" && <>Locked at <span style={{ color: "var(--tx)", fontWeight: 600 }}>${fmt(round.openPrice)}</span> — settling soon</>}
              {round.phase === "settled" && (
                <>
                  {round.result === "up" ? "📈 Went UP" : round.result === "down" ? "📉 Went DOWN" : "⚖ No change"}
                  {" "}· Close <span style={{ color: "var(--tx)", fontWeight: 600 }}>${fmt(round.closePrice)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Pools ────────────────────────────────────────────────────── */}
      {round && (
        <div style={{ display: "flex", gap: 10 }}>
          {/* UP */}
          <div style={{ flex: 1, background: "rgba(0,245,160,0.07)", border: "1px solid rgba(0,245,160,0.2)", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", color: "#00F5A0", marginBottom: 6 }}>▲ UP</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#00F5A0", fontFamily: "'JetBrains Mono',monospace" }}>{usd(upPool)}</div>
            <div style={{ fontSize: 11, color: "rgba(0,245,160,0.6)", marginTop: 3 }}>{upMult}× payout</div>
          </div>

          {/* Divider + split */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, minWidth: 44 }}>
            <div style={{ fontSize: 9, color: "var(--sub)", letterSpacing: "0.5px" }}>SPLIT</div>
            <div style={{ width: 10, height: 64, borderRadius: 5, background: "rgba(255,255,255,0.05)", overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${upPct}%`, background: "#00F5A0", borderRadius: "0 0 5px 5px", transition: "height .6s ease" }} />
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: `${100 - upPct}%`, background: "#FF4D4D", borderRadius: "5px 5px 0 0", transition: "height .6s ease" }} />
            </div>
            <div style={{ fontSize: 9, color: "var(--sub)" }}>{upPct.toFixed(0)}%</div>
          </div>

          {/* DOWN */}
          <div style={{ flex: 1, background: "rgba(255,77,77,0.07)", border: "1px solid rgba(255,77,77,0.2)", borderRadius: 14, padding: "14px 16px", textAlign: "right" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", color: "#FF4D4D", marginBottom: 6 }}>▼ DOWN</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#FF4D4D", fontFamily: "'JetBrains Mono',monospace" }}>{usd(downPool)}</div>
            <div style={{ fontSize: 11, color: "rgba(255,77,77,0.6)", marginTop: 3 }}>{downMult}× payout</div>
          </div>
        </div>
      )}

      {/* ── Bet UI / My bet ──────────────────────────────────────────── */}
      {round && (
        round.myBet ? (
          /* Already bet */
          <div className="card" style={{ padding: "18px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 12, letterSpacing: "1px" }}>YOUR PREDICTION</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <div style={{
                fontSize: 18, fontWeight: 800, padding: "10px 22px", borderRadius: 12,
                background: round.myBet.side === "up" ? "rgba(0,245,160,.12)" : "rgba(255,77,77,.12)",
                color:      round.myBet.side === "up" ? "#00F5A0" : "#FF4D4D",
                border:     `1.5px solid ${round.myBet.side === "up" ? "rgba(0,245,160,.3)" : "rgba(255,77,77,.3)"}`,
              }}>
                {round.myBet.side === "up" ? "▲ UP" : "▼ DOWN"}
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--tx)" }}>{usd(round.myBet.amount)}</div>
                {round.myBet.payout !== null && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: round.myBet.payout > 0 ? "#00F5A0" : "#FF4D4D", marginTop: 3 }}>
                    {round.myBet.payout > 0 ? `+${usd(round.myBet.payout)}` : "Lost"}
                  </div>
                )}
              </div>
            </div>
            {round.phase !== "settled" && (
              <div style={{ marginTop: 12, fontSize: 11, color: "var(--sub)" }}>
                {round.phase === "locked" ? "⏳ Waiting for settlement…" : "✓ Bet placed"}
              </div>
            )}
          </div>
        ) : round.phase === "open" ? (
          /* Betting UI */
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14, padding: "18px 16px" }}>
            {/* UP / DOWN buttons */}
            <div style={{ display: "flex", gap: 10 }}>
              {["up", "down"].map(s => {
                const sel   = side === s;
                const color = s === "up" ? "#00F5A0" : "#FF4D4D";
                const m     = s === "up" ? upMult : downMult;
                return (
                  <button key={s} onClick={() => setSide(s)} style={{
                    flex: 1, padding: "16px 10px", borderRadius: 14, cursor: "pointer",
                    border:      sel ? `2px solid ${color}` : `2px solid ${color}28`,
                    background:  sel ? `${color}14` : `${color}05`,
                    color,       fontFamily: "'Inter',sans-serif",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
                    transition: "all .15s", outline: "none",
                    boxShadow: sel ? `0 0 20px ${color}25` : "none",
                  }}>
                    <span style={{ fontSize: 26, lineHeight: 1 }}>{s === "up" ? "▲" : "▼"}</span>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{s.toUpperCase()}</span>
                    <span style={{ fontSize: 11, opacity: 0.65 }}>{m}× payout</span>
                  </button>
                );
              })}
            </div>

            {/* Wager */}
            <div>
              <div style={{ fontSize: 10, color: "var(--sub)", letterSpacing: "2px", marginBottom: 8 }}>WAGER (CREDITS)</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: "var(--sub)", fontSize: 18, flexShrink: 0 }}>$</span>
                <input
                  className="inp" type="number" value={wager}
                  min={MIN_BET} max={MAX_BET} step="1"
                  onChange={e => { setWager(e.target.value); setBetErr(null); }}
                  disabled={betting}
                  style={{ flex: 1 }}
                />
              </div>
              {/* Quick pick */}
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                {[5, 10, 25, 50, 100].map(v => (
                  <button key={v} onClick={() => setWager(String(v))} style={{
                    flex: 1, padding: "6px 0", borderRadius: 8, cursor: "pointer",
                    border:      "1px solid var(--bd)",
                    background:  wager === String(v) ? "rgba(108,99,255,.18)" : "var(--s2)",
                    color:       wager === String(v) ? "var(--blue)"          : "var(--sub)",
                    fontSize: 11, fontWeight: 600, fontFamily: "'Inter',sans-serif",
                    transition: "all .12s",
                  }}>
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            {betErr && (
              <div style={{ fontSize: 12, color: "var(--red)", textAlign: "center", padding: "4px 8px" }}>
                ⚠ {betErr}
              </div>
            )}

            {/* Submit */}
            <button
              className="btn"
              onClick={placeBet}
              disabled={betting}
              style={{
                background: side === "up"
                  ? "linear-gradient(135deg, #009e68, #00F5A0)"
                  : "linear-gradient(135deg, #b52222, #FF4D4D)",
                color: "#fff", fontWeight: 800, fontSize: 16,
                border: "none", borderRadius: 12, padding: "15px",
                cursor: betting ? "not-allowed" : "pointer",
                opacity: betting ? 0.7 : 1,
                transition: "opacity .15s, transform .1s",
                letterSpacing: "0.5px",
              }}
            >
              {betting ? "Placing…" : `${side === "up" ? "▲ PREDICT UP" : "▼ PREDICT DOWN"} · $${wager}`}
            </button>
          </div>
        ) : (
          /* Locked / settled waiting */
          <div className="card" style={{ padding: "28px 20px", textAlign: "center", color: "var(--sub)", fontSize: 13 }}>
            {round.phase === "locked"
              ? <><div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>Betting closed — round settling</>
              : <><div style={{ fontSize: 24, marginBottom: 8 }}>⏱</div>Next round starting soon…</>
            }
          </div>
        )
      )}

      {/* ── History ──────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="card" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 10, color: "var(--sub)", letterSpacing: "1.5px", marginBottom: 10 }}>RECENT ROUNDS</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {history.map(h => {
              const isUp   = h.result === "up";
              const isDown = h.result === "down";
              const c      = isUp ? "#00F5A0" : isDown ? "#FF4D4D" : "var(--sub)";
              const bg     = isUp ? "rgba(0,245,160,.12)" : isDown ? "rgba(255,77,77,.12)" : "rgba(255,255,255,.05)";
              const bd     = isUp ? "rgba(0,245,160,.25)" : isDown ? "rgba(255,77,77,.25)" : "rgba(255,255,255,.1)";
              return (
                <div key={h.id}
                  title={`$${fmt(h.openPrice)} → $${fmt(h.closePrice)}`}
                  style={{
                    width: 30, height: 30, borderRadius: 7,
                    background: bg, border: `1px solid ${bd}`, color: c,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 800, cursor: "default",
                  }}>
                  {isUp ? "▲" : isDown ? "▼" : "="}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: "var(--dim)", display: "flex", gap: 16 }}>
            <span>🟢 UP wins: {history.filter(h => h.result === "up").length}</span>
            <span>🔴 DOWN wins: {history.filter(h => h.result === "down").length}</span>
          </div>
        </div>
      )}

      {/* ── Win/loss flash ────────────────────────────────────────────── */}
      {flashResult && <ResultFlash result={flashResult} onDone={() => setFlashResult(null)} />}

      {/* Disclaimer */}
      <div style={{ fontSize: 10, color: "var(--dim)", textAlign: "center", padding: "2px 0 4px" }}>
        Prediction credits · price data via Binance
      </div>
    </div>
  );
}
