"use client";

import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";

const COINFLIP = process.env.NEXT_PUBLIC_COINFLIP_ADDRESS;
const DICEROLL = process.env.NEXT_PUBLIC_DICEROLL_ADDRESS;
const BINGO    = process.env.NEXT_PUBLIC_BINGO_ADDRESS;

const BET_RESOLVED_EVENT = {
  name: "BetResolved",
  type: "event",
  inputs: [
    { name: "seqNum", type: "uint64",  indexed: true  },
    { name: "player", type: "address", indexed: true  },
    { name: "wager",  type: "uint256", indexed: false },
    { name: "payout", type: "uint256", indexed: false },
    { name: "won",    type: "bool",    indexed: false },
  ],
};

const GAME_META = {
  coinflip: { label: "Coin Flip", icon: "🪙" },
  diceroll: { label: "Dice Roll", icon: "🎲" },
  bingo:    { label: "Bingo",     icon: "🎯" },
};

const DEMO = [
  { id: "d1", game: "coinflip", player: "0xaBcD...1234", wager: 10,  won: true,  payout: 19.40 },
  { id: "d2", game: "diceroll", player: "0x7f3E...8a91", wager: 25,  won: false, payout: 0     },
  { id: "d3", game: "coinflip", player: "0x1122...aaFF", wager: 5,   won: true,  payout: 9.70  },
  { id: "d4", game: "diceroll", player: "0xdead...beef", wager: 50,  won: true,  payout: 97.00 },
  { id: "d5", game: "coinflip", player: "0x9999...0001", wager: 15,  won: false, payout: 0     },
  { id: "d6", game: "coinflip", player: "0x3f7A...22CC", wager: 100, won: true,  payout: 194.00},
  { id: "d7", game: "diceroll", player: "0xC0ff...eE01", wager: 20,  won: false, payout: 0     },
];

function shortAddr(addr) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function TickerItem({ game, player, wager, won, payout }) {
  const meta = GAME_META[game] || { label: game, icon: "🎮" };
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: "0 22px",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      height: "100%", whiteSpace: "nowrap", flexShrink: 0,
    }}>
      <span style={{ fontSize: 14 }}>{meta.icon}</span>
      <span style={{
        fontSize: 11, color: "#9094B0",
        fontFamily: "'JetBrains Mono', monospace",
      }}>{player}</span>
      <span style={{
        fontSize: 11, fontWeight: 600, color: "#F0F2FF",
        fontFamily: "'Inter', sans-serif",
      }}>${typeof wager === "bigint" ? (Number(wager) / 1e6).toFixed(2) : wager.toFixed(2)}</span>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.4px",
        fontFamily: "'Inter', sans-serif",
        color: won ? "#00F5A0" : "#FF4D6D",
        background: won ? "rgba(0,245,160,0.1)" : "rgba(255,77,109,0.1)",
        border: `1px solid ${won ? "rgba(0,245,160,0.22)" : "rgba(255,77,109,0.22)"}`,
        borderRadius: 4, padding: "1px 7px",
      }}>
        {won
          ? `+$${typeof payout === "bigint" ? (Number(payout) / 1e6).toFixed(2) : payout.toFixed(2)}`
          : "LOST"}
      </span>
    </div>
  );
}

export default function LiveBetTicker() {
  const pub = usePublicClient();
  const [bets, setBets]     = useState([]);
  const [paused, setPaused] = useState(false);
  const unwatchers = useRef([]);

  useEffect(() => {
    if (!pub) return;

    const contracts = [
      COINFLIP && { address: COINFLIP, game: "coinflip" },
      DICEROLL && { address: DICEROLL, game: "diceroll" },
      BINGO    && { address: BINGO,    game: "bingo"    },
    ].filter(Boolean);

    if (!contracts.length) return;

    async function seed() {
      try {
        const latest = await pub.getBlockNumber();
        const from   = latest > 2000n ? latest - 2000n : 0n;

        const allLogs = (await Promise.all(
          contracts.map(({ address, game }) =>
            pub.getLogs({ address, event: BET_RESOLVED_EVENT, fromBlock: from, toBlock: "latest" })
              .then(logs => logs.map(l => ({ ...l, game })))
              .catch(() => [])
          )
        )).flat().sort((a, b) => Number(b.blockNumber - a.blockNumber)).slice(0, 40);

        if (allLogs.length > 0) {
          setBets(allLogs.map(l => ({
            id:     `${l.game}-${l.args.seqNum}`,
            game:   l.game,
            player: shortAddr(l.args.player),
            wager:  l.args.wager,
            won:    l.args.won,
            payout: l.args.payout,
          })));
        }
      } catch {}
    }

    seed();

    for (const { address, game } of contracts) {
      try {
        const unwatch = pub.watchContractEvent({
          address,
          abi: [BET_RESOLVED_EVENT],
          eventName: "BetResolved",
          onLogs(logs) {
            setBets(prev => {
              const fresh = logs.map(l => ({
                id:     `${game}-${l.args.seqNum}-${Date.now()}`,
                game,
                player: shortAddr(l.args.player),
                wager:  l.args.wager,
                won:    l.args.won,
                payout: l.args.payout,
              }));
              return [...fresh, ...prev].slice(0, 60);
            });
          },
        });
        unwatchers.current.push(unwatch);
      } catch {}
    }

    return () => {
      unwatchers.current.forEach(u => { try { u(); } catch {} });
      unwatchers.current = [];
    };
  }, [pub]);

  const items = bets.length > 0 ? bets : DEMO;
  const doubled = [...items, ...items];

  return (
    <>
      <style>{`
        @keyframes liveDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
        @keyframes tickerMove { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        .ticker-track { animation: tickerMove ${Math.max(items.length * 5, 30)}s linear infinite; }
        .ticker-track.paused { animation-play-state: paused; }
      `}</style>

      <div
        style={{
          display: "flex", alignItems: "center", height: 36,
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(0,0,0,0.28)",
          overflow: "hidden", position: "relative",
        }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div style={{
          flexShrink: 0, display: "flex", alignItems: "center", gap: 7,
          padding: "0 14px", height: "100%",
          borderRight: "1px solid rgba(255,255,255,0.09)",
          background: "rgba(0,0,0,0.35)", zIndex: 2,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#00F5A0", boxShadow: "0 0 7px #00F5A0",
            animation: "liveDot 1.4s ease infinite",
          }} />
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#00F5A0",
            letterSpacing: "1.5px", fontFamily: "'Inter',sans-serif",
          }}>LIVE</span>
        </div>

        <div style={{ flex: 1, overflow: "hidden", position: "relative", height: "100%" }}>
          <div
            className={`ticker-track${paused ? " paused" : ""}`}
            style={{ display: "inline-flex", alignItems: "center", height: "100%", willChange: "transform" }}
          >
            {doubled.map((bet, i) => (
              <TickerItem key={`${bet.id}-${i}`} {...bet} />
            ))}
          </div>
        </div>

        <div style={{
          position: "absolute", left: 90, top: 0, bottom: 0, width: 28, zIndex: 1,
          background: "linear-gradient(to right, rgba(0,0,0,0.28), transparent)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: 40, zIndex: 1,
          background: "linear-gradient(to left, rgba(7,5,15,0.9), transparent)",
          pointerEvents: "none",
        }} />
      </div>
    </>
  );
}
