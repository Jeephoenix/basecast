import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { rateLimit, getIp } from "@/lib/rateLimit";

function makeCode(address) {
  return address.slice(2, 10).toUpperCase();
}

export async function GET(req) {
  const ip = getIp(req);
  const { allowed } = rateLimit({ key: `referral-get:${ip}`, limit: 60, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const db = getPool();

  const resolve = searchParams.get("resolve");
  if (resolve) {
    const { rows } = await db.query(
      "SELECT address FROM ref_codes WHERE code = $1",
      [resolve.toUpperCase()]
    );
    return NextResponse.json({ address: rows[0]?.address || null });
  }

  const code = (searchParams.get("code") || "").toUpperCase();
  if (!code) return NextResponse.json({ count: 0 });

  const { rows } = await db.query(
    "SELECT wallet FROM referrals WHERE code = $1",
    [code]
  );

  return NextResponse.json({
    count: rows.length,
    referrals: rows.map(r => r.wallet),
  });
}

export async function POST(req) {
  const ip = getIp(req);
  const { allowed } = rateLimit({ key: `referral-post:${ip}`, limit: 10, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  try {
    const { referrerCode, wallet } = await req.json();
    if (!referrerCode || !wallet) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const code = referrerCode.toUpperCase();
    const walletLower = wallet.toLowerCase();
    const db = getPool();

    await db.query(
      `INSERT INTO referrals (code, wallet)
       VALUES ($1, $2)
       ON CONFLICT (code, wallet) DO NOTHING`,
      [code, walletLower]
    );

    const { rows } = await db.query(
      "SELECT COUNT(*) AS count FROM referrals WHERE code = $1",
      [code]
    );

    return NextResponse.json({ ok: true, count: parseInt(rows[0].count, 10) });
  } catch (err) {
    console.error("POST /api/referral error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function PUT(req) {
  const ip = getIp(req);
  const { allowed } = rateLimit({ key: `referral-put:${ip}`, limit: 10, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  try {
    const { address } = await req.json();
    if (!address) return NextResponse.json({ ok: false }, { status: 400 });

    const addr = address.toLowerCase();
    const code = makeCode(address);
    const db = getPool();

    await db.query(
      `INSERT INTO ref_codes (code, address)
       VALUES ($1, $2)
       ON CONFLICT (address) DO UPDATE SET code = EXCLUDED.code`,
      [code, addr]
    );

    return NextResponse.json({ ok: true, code });
  } catch (err) {
    console.error("PUT /api/referral error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
