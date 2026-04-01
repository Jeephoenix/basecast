import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") || "").toUpperCase();
  if (!code) return NextResponse.json({ count: 0 });

  const db = getPool();
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
