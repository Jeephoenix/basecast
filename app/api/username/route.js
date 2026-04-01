import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

const MIN_LENGTH = 4;
const MAX_LENGTH = 24;

function normalise(username) {
  return username.trim().toLowerCase();
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const db = getPool();

  const username = searchParams.get("username");
  if (username !== null) {
    const key = normalise(username);
    const { rows } = await db.query(
      "SELECT 1 FROM usernames WHERE LOWER(username) = $1 LIMIT 1",
      [key]
    );
    return NextResponse.json({ available: rows.length === 0 });
  }

  const address = searchParams.get("address");
  if (address) {
    const { rows } = await db.query(
      "SELECT username FROM usernames WHERE address = $1",
      [address.toLowerCase()]
    );
    return NextResponse.json({ username: rows[0]?.username || null });
  }

  const addresses = searchParams.get("addresses");
  if (addresses) {
    const addrs = addresses.split(",").map(a => a.toLowerCase());
    const { rows } = await db.query(
      "SELECT address, username FROM usernames WHERE address = ANY($1)",
      [addrs]
    );
    const result = {};
    for (const row of rows) result[row.address] = row.username;
    return NextResponse.json({ usernames: result });
  }

  return NextResponse.json({ error: "Missing query param" }, { status: 400 });
}

export async function POST(req) {
  try {
    const { username, address } = await req.json();

    if (!username || !address) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    const trimmed = username.trim();
    const key = normalise(trimmed);
    const addr = address.toLowerCase();

    if (trimmed.length < MIN_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `Username must be at least ${MIN_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (trimmed.length > MAX_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `Username must be at most ${MAX_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return NextResponse.json(
        { ok: false, error: "Only letters, numbers and underscores allowed" },
        { status: 400 }
      );
    }

    const db = getPool();

    const { rows } = await db.query(
      "SELECT address FROM usernames WHERE LOWER(username) = $1",
      [key]
    );

    if (rows.length > 0 && rows[0].address !== addr) {
      return NextResponse.json(
        { ok: false, error: "Username already taken" },
        { status: 409 }
      );
    }

    await db.query(
      `INSERT INTO usernames (address, username, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (address) DO UPDATE
         SET username = EXCLUDED.username,
             updated_at = NOW()`,
      [addr, key]
    );

    return NextResponse.json({ ok: true, username: key });
  } catch (err) {
    console.error("POST /api/username error:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
