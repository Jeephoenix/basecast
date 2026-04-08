import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { rateLimit, getIp } from "@/lib/rateLimit";

const BINANCE_URL = "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT";
const HOUSE_EDGE  = 0.03;
const BET_LOCK_S  = 50;
const MIN_BET     = 1;
const MAX_BET     = 500;

async function getBtcPrice() {
  try {
    const res  = await fetch(BINANCE_URL, { cache: "no-store" });
    const json = await res.json();
    return parseFloat(json.price) || null;
  } catch {
    return null;
  }
}

function currentRoundTimes(now = Date.now()) {
  const openMs  = Math.floor(now / 60_000) * 60_000;
  return { openTime: new Date(openMs), closeTime: new Date(openMs + 60_000) };
}

function getPhase(openTime, closeTime, now = Date.now()) {
  const o = new Date(openTime).getTime();
  const c = new Date(closeTime).getTime();
  if (now >= c) return "settled";
  if (now >= o + BET_LOCK_S * 1000) return "locked";
  return "open";
}

async function ensureTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS predict_rounds (
      id          BIGSERIAL PRIMARY KEY,
      open_time   TIMESTAMPTZ NOT NULL UNIQUE,
      close_time  TIMESTAMPTZ NOT NULL,
      open_price  NUMERIC(18,2),
      close_price NUMERIC(18,2),
      result      TEXT,
      up_pool     NUMERIC(18,6) NOT NULL DEFAULT 0,
      down_pool   NUMERIC(18,6) NOT NULL DEFAULT 0,
      settled     BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS predict_bets (
      id          BIGSERIAL PRIMARY KEY,
      round_id    BIGINT NOT NULL REFERENCES predict_rounds(id),
      address     TEXT NOT NULL,
      side        TEXT NOT NULL,
      amount      NUMERIC(18,6) NOT NULL,
      payout      NUMERIC(18,6),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(round_id, address)
    );
  `);
}

async function settleOldRounds(db) {
  const { rows } = await db.query(
    "SELECT * FROM predict_rounds WHERE settled = false AND close_time < NOW()"
  );
  for (const round of rows) {
    const closePrice = await getBtcPrice();
    if (!closePrice) continue;
    const openPrice = parseFloat(round.open_price);
    const result    = closePrice > openPrice ? "up" : closePrice < openPrice ? "down" : "same";
    const upPool    = parseFloat(round.up_pool);
    const downPool  = parseFloat(round.down_pool);
    const totalPool = upPool + downPool;
    const winPool   = result === "up" ? upPool : downPool;
    if (result !== "same" && winPool > 0) {
      const prize = totalPool * (1 - HOUSE_EDGE);
      const { rows: winners } = await db.query(
        "SELECT * FROM predict_bets WHERE round_id = $1 AND side = $2",
        [round.id, result]
      );
      for (const bet of winners) {
        const payout = (parseFloat(bet.amount) / winPool) * prize;
        await db.query("UPDATE predict_bets SET payout = $1 WHERE id = $2", [payout.toFixed(6), bet.id]);
      }
      await db.query("UPDATE predict_bets SET payout = 0 WHERE round_id = $1 AND side != $2", [round.id, result]);
    } else {
      await db.query("UPDATE predict_bets SET payout = amount WHERE round_id = $1", [round.id]);
    }
    await db.query(
      "UPDATE predict_rounds SET settled = true, close_price = $1, result = $2 WHERE id = $3",
      [closePrice.toFixed(2), result, round.id]
    );
  }
}

async function ensureCurrentRound(db) {
  const { openTime, closeTime } = currentRoundTimes();
  const { rows } = await db.query("SELECT * FROM predict_rounds WHERE open_time = $1", [openTime]);
  if (rows.length) return rows[0];
  const price = await getBtcPrice();
  const { rows: created } = await db.query(
    "INSERT INTO predict_rounds (open_time, close_time, open_price) VALUES ($1, $2, $3) ON CONFLICT (open_time) DO UPDATE SET open_time = EXCLUDED.open_time RETURNING *",
    [openTime, closeTime, price?.toFixed(2)]
  );
  return created[0];
}

export async function GET(req) {
  const ip = getIp(req);
  const { allowed } = rateLimit({ key: `predict-get:${ip}`, limit: 60, windowMs: 60_000 });
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    const db = getPool();
    await ensureTables(db);
    await settleOldRounds(db);

    const round   = await ensureCurrentRound(db);
    const phase   = getPhase(round.open_time, round.close_time);
    const address = new URL(req.url).searchParams.get("address");

    let myBet = null;
    if (address) {
      const { rows } = await db.query(
        "SELECT * FROM predict_bets WHERE round_id = $1 AND address = LOWER($2)",
        [round.id, address]
      );
      if (rows.length) {
        const b = rows[0];
        myBet = { side: b.side, amount: parseFloat(b.amount), payout: b.payout !== null ? parseFloat(b.payout) : null };
      }
    }

    const { rows: history } = await db.query(
      `SELECT id, open_price, close_price, result, up_pool, down_pool
       FROM predict_rounds WHERE settled = true ORDER BY open_time DESC LIMIT 12`
    );

    return NextResponse.json({
      round: {
        id:         round.id,
        phase,
        openTime:   round.open_time,
        closeTime:  round.close_time,
        openPrice:  round.open_price  ? parseFloat(round.open_price)  : null,
        closePrice: round.close_price ? parseFloat(round.close_price) : null,
        result:     round.result,
        upPool:     parseFloat(round.up_pool),
        downPool:   parseFloat(round.down_pool),
        myBet,
      },
      history: history.map(r => ({
        id:         r.id,
        result:     r.result,
        openPrice:  parseFloat(r.open_price),
        closePrice: parseFloat(r.close_price),
        upPool:     parseFloat(r.up_pool),
        downPool:   parseFloat(r.down_pool),
      })),
    });
  } catch (err) {
    console.error("GET /api/predict:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req) {
  const ip = getIp(req);
  const { allowed } = rateLimit({ key: `predict-post:${ip}`, limit: 10, windowMs: 60_000 });
  if (!allowed) return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });

  try {
    const { address, side, amount, roundId } = await req.json();
    if (!address || !side || !amount || !roundId)
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    if (!["up", "down"].includes(side))
      return NextResponse.json({ ok: false, error: "Invalid side" }, { status: 400 });

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < MIN_BET || amt > MAX_BET)
      return NextResponse.json({ ok: false, error: `Bet must be $${MIN_BET}–$${MAX_BET}` }, { status: 400 });

    const db = getPool();
    await ensureTables(db);

    const { rows } = await db.query("SELECT * FROM predict_rounds WHERE id = $1", [roundId]);
    if (!rows.length) return NextResponse.json({ ok: false, error: "Round not found" }, { status: 404 });

    const round = rows[0];
    if (getPhase(round.open_time, round.close_time) !== "open")
      return NextResponse.json({ ok: false, error: "Betting is closed for this round" }, { status: 400 });

    const poolCol = side === "up" ? "up_pool" : "down_pool";
    await db.query(
      `INSERT INTO predict_bets (round_id, address, side, amount) VALUES ($1, LOWER($2), $3, $4)`,
      [roundId, address, side, amt.toFixed(6)]
    );
    await db.query(
      `UPDATE predict_rounds SET ${poolCol} = ${poolCol} + $1 WHERE id = $2`,
      [amt.toFixed(6), roundId]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err.code === "23505")
      return NextResponse.json({ ok: false, error: "You already placed a bet this round" }, { status: 400 });
    console.error("POST /api/predict:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
