import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "usernames.json");
const MIN_LENGTH = 4;
const MAX_LENGTH = 24;

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch { return { byAddress: {}, byUsername: {} }; }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function normalise(username) {
  return username.trim().toLowerCase();
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const data = load();

  const username = searchParams.get("username");
  if (username !== null) {
    const key = normalise(username);
    const taken = !!data.byUsername[key];
    return NextResponse.json({ available: !taken });
  }

  const address = searchParams.get("address");
  if (address) {
    const addr = address.toLowerCase();
    const name = data.byAddress[addr] || null;
    return NextResponse.json({ username: name });
  }

  const addresses = searchParams.get("addresses");
  if (addresses) {
    const addrs = addresses.split(",").map(a => a.toLowerCase());
    const result = {};
    for (const addr of addrs) {
      result[addr] = data.byAddress[addr] || null;
    }
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
      return NextResponse.json({ ok: false, error: `Username must be at least ${MIN_LENGTH} characters` }, { status: 400 });
    }

    if (trimmed.length > MAX_LENGTH) {
      return NextResponse.json({ ok: false, error: `Username must be at most ${MAX_LENGTH} characters` }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return NextResponse.json({ ok: false, error: "Only letters, numbers and underscores allowed" }, { status: 400 });
    }

    const data = load();

    const existingOwner = data.byUsername[key];
    if (existingOwner && existingOwner !== addr) {
      return NextResponse.json({ ok: false, error: "Username already taken" }, { status: 409 });
    }

    const oldUsername = data.byAddress[addr];
    if (oldUsername && oldUsername !== key) {
      delete data.byUsername[oldUsername];
    }

    data.byAddress[addr] = key;
    data.byUsername[key] = addr;
    save(data);

    return NextResponse.json({ ok: true, username: key });
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

