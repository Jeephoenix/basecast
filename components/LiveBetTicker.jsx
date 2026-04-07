"use client";

import { useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";

const COINFLIP = process.env.NEXT_PUBLIC_COINFLIP_ADDRESS;
const DICEROLL = process.env.NEXT_PUBLIC_DICEROLL_ADDRESS;
const BINGO    = process.env.NEXT_PUBLIC_BINGO_ADDRESS;
const BINGO_MP = process.env.NEXT_PUBLIC_BINGO_MULTIPLAYER_ADDRESS;

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

const ROUND_FINISHED_EVENT = {
  name: "RoundFinished",
  type: "event",
  inputs: [
    { name: "roundId",    type: "uint256",   indexed: true  },
    { name: "winners",    type: "address[]", indexed: false },
    { name: "payoutEach", type: "uint256",   indexed: false },
    { name: "houseCut",   type: "uint256",   indexed: false },
  ],
};

const BMP_GET_ROUND_ABI = [
  {
    name: "getRound", type: "function", stateMutability: "view",
    inputs:  [{ name: "roundId", type: "uint256" }],
    outputs: [
      { name: "entryFee",      type: "uint256" },
      { name: "maxPlayers",    type: "uint256" },
      { name: "timerDuration", type: "uint256" },
      { name: "startTime",     type: "uint256" },
      { name: "prizePool",     type: "uint256" },
      { name: "mode",          type: "uint8"   },
      { name: "state",         type: "uint8"   },
      { name: "playerCount",   type: "uint256" },
      { name: "winners",       type: "address[]" },
      { name: "seeded",        type: "bool"    },
      { name: "entropySeqNum", type: "uint64"  },
    ],
  },
];

const IcoCoin = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFD166" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 7v10M9 9.5a3 2.5 0 0 1 6 0M15 14.5a3 2.5 0 0 1-6 0"/>
  </svg>
);

const IcoDice = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3"/>
    <circle cx="8.5"  cy="8.5"  r="1.2" fill="#6C63FF" stroke="none"/>
    <circle cx="15.5" cy="8.5"  r="1.2" fill="#6C63FF" stroke="none"/>
    <circle cx="8.5"  cy="15.5" r="1.2" fill="#6C63FF" stroke="none"/>
    <circle cx="15.5" cy="15.5" r="1.2" fill="#6C63FF" stroke="none"/>
    <circle cx="12"   cy="12"   r="1.2" fill="#6C63FF" stroke="none"/>
  </svg>
);

const IcoBingo = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00F5A0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <line x1="3"  y1="9"  x2="21" y2="9"/>
    <line x1="3"  y1="15" x2="21" y2="15"/>
    <line x1="9"  y1="3"  x2="9"  y2="21"/>
    <line x1="15" y1="3"  x2="15" y2="21"/>
    <circle cx="12" cy="12" r="2" fill="#00F5A0" stroke="none"/>
  </svg>
);

const IcoBingoMP = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <line x1="3"  y1="9"  x2="21" y2="9"/>
    <line x1="3"  y1="15" x2="21" y2="15"/>
    <line x1="9"  y1="3"  x2="9"  y2="21"/>
    <line x1="15" y1="3"  x2="15" y2="21"/>
    <circle cx="7" cy="7" r="1.5" fill="#6C63FF" stroke="none"/>
    <circle cx="17" cy="17" r="1.5" fill="#6C63FF" stroke="none"/>
  </svg>
);

const GAME_META = {
  coinflip:  { label: "Coin Flip",      Icon: IcoCoin     },
  diceroll:  { label: "Dice Roll",      Icon: IcoDice     },
  bingo:     { label: "Bingo",          Icon: IcoBingo    },
  "bingo-mp":{ label: "Bingo MP",       Icon: IcoBingoMP  },
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
  const meta = GAME_META[game] || { label: game, Icon: () => null };
  const Icon = meta.Icon;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: "0 22px",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      height: "100%", whiteSpace: "nowrap", flexShrink: 0,
    }}>
      <Icon />
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
  const [bets, setBets]       = useState([]);
  const [paused, setPaused]   = useState(false);
  const [mounted, setMounted] = useState(false);
  const unwatchers = useRef([]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!pub) return;

    const contracts = [
      COINFLIP && { address: COINFLIP, game: "coinflip" },
      DICEROLL && { address: DICEROLL, game: "diceroll" },
      BINGO    && { address: BINGO,    game: "bingo"    },
    ].filter(Boolean);

    // Helper: resolve a RoundFinished log into one ticker entry per winner
    async function bmpLogsToEntries(logs) {
      const entries = [];
      for (const l of logs) {
        try {
          const roundId = l.args.roundId;
          const r = await pub.readContract({
            address: BINGO_MP,
            abi: BMP_GET_ROUND_ABI,
            functionName: "getRound",
            args: [roundId],
          });
          const entryFee   = r[0]; // positional: entryFee
          const winners    = l.args.winners;
          const payoutEach = l.args.payoutEach;
          for (const winner of winners) {
            entries.push({
              id:     `bingo-mp-${roundId}-${winner}-${l.blockNumber}`,
              game:   "bingo-mp",
              player: shortAddr(winner),
              wager:  entryFee,
              won:    true,
              payout: payoutEach,
            });
          }
        } catch {}
      }
      return entries;
    }

    async function seed() {
      try {
        const latest = await pub.getBlockNumber();
        const from   = latest > 2000n ? latest - 2000n : 0n;

        // BetResolved logs from standard game contracts
        const betLogs = (await Promise.all(
          contracts.map(({ address, game }) =>
            pub.getLogs({ address, event: BET_RESOLVED_EVENT, fromBlock: from, toBlock: "latest" })
              .then(logs => logs.map(l => ({ ...l, game })))
              .catch(() => [])
          )
        )).flat().sort((a, b) => Number(b.blockNumber - a.blockNumber)).slice(0, 40);

        const betEntries = betLogs.map(l => ({
          id:     `${l.game}-${l.args.seqNum}`,
          game:   l.game,
          player: shortAddr(l.args.player),
          wager:  l.args.wager,
          won:    l.args.won,
          payout: l.args.payout,
        }));

        // RoundFinished logs from BingoMultiplayer
        let bmpEntries = [];
        if (BINGO_MP) {
          try {
            const bmpLogs = await pub.getLogs({
              address: BINGO_MP,
              event: ROUND_FINISHED_EVENT,
              fromBlock: from,
              toBlock: "latest",
            });
            bmpEntries = await bmpLogsToEntries(bmpLogs.slice(-10));
          } catch {}
        }

        const all = [...betEntries, ...bmpEntries]
          .sort((a, b) => Number((b.blockNumber || 0n) - (a.blockNumber || 0n)))
          .slice(0, 60);

        if (all.length > 0) setBets(all);
      } catch {}
    }

    seed();

    // Watch BetResolved on standard contracts
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

    // Watch RoundFinished on BingoMultiplayer
    if (BINGO_MP) {
      try {
        const unwatch = pub.watchContractEvent({
          address: BINGO_MP,
          abi: [ROUND_FINISHED_EVENT],
          eventName: "RoundFinished",
          async onLogs(logs) {
            const fresh = await bmpLogsToEntries(logs);
            if (fresh.length > 0) {
              setBets(prev => [...fresh, ...prev].slice(0, 60));
            }
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

  if (!mounted) return (
    <div style={{ height: 36, background: "rgba(0,0,0,0.28)", borderBottom: "1px solid rgba(255,255,255,0.07)" }} />
  );

  const items = bets.length > 0 ? bets : DEMO;
  const doubled = [...items, ...items];

  const duration = Math.max(items.length * 3, 18);

  return (
    <>
      <style>{`
        @keyframes liveDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
        @keyframes tickerMove { from{transform:translateX(0)} to{transform:translateX(-50%)} }
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
            style={{
              display: "inline-flex", alignItems: "center", height: "100%", willChange: "transform",
              animation: `tickerMove ${duration}s linear infinite`,
              animationPlayState: paused ? "paused" : "running",
            }}
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
