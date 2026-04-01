import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "referrals.json");

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch { return {}; }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("code") || "").toUpperCase();
  if (!code) return NextResponse.json({ count: 0 });
  const data = load();
  const referrals = data[code] || [];
  return NextResponse.json({ count: referrals.length, referrals });
}

export async function POST(req) {
  try {
    const { referrerCode, wallet } = await req.json();
    if (!referrerCode || !wallet) return NextResponse.json({ ok: false }, { status: 400 });
    const code = referrerCode.toUpperCase();
    const data = load();
    if (!data[code]) data[code] = [];
    const walletLower = wallet.toLowerCase();
    if (!data[code].includes(walletLower)) {
      data[code].push(walletLower);
      save(data);
    }
    return NextResponse.json({ ok: true, count: data[code].length });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
