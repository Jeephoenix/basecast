import { NextResponse } from "next/server";
import { rateLimit, getIp } from "@/lib/rateLimit";

const SUPPORTED_TOKENS = ["eth", "usdc"];
const RPC_URL = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "84532");

export async function POST(req) {
  if (CHAIN_ID === 8453) {
    return NextResponse.json({ ok: false, error: "Faucet only available on testnet" }, { status: 400 });
  }

  const ip = getIp(req);
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { address, token } = body;

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ ok: false, error: "Invalid wallet address" }, { status: 400 });
  }

  if (!token || !SUPPORTED_TOKENS.includes(token)) {
    return NextResponse.json({ ok: false, error: "Invalid token. Must be 'eth' or 'usdc'" }, { status: 400 });
  }

  const addrKey = address.toLowerCase();

  const ipCheck = rateLimit({ key: `faucet-ip:${ip}:${token}`, limit: 3, windowMs: 86_400_000 });
  if (!ipCheck.allowed) {
    return NextResponse.json({ ok: false, error: "Daily faucet limit reached. Try again tomorrow." }, { status: 429 });
  }

  const addrCheck = rateLimit({ key: `faucet-addr:${addrKey}:${token}`, limit: 1, windowMs: 86_400_000 });
  if (!addrCheck.allowed) {
    return NextResponse.json({ ok: false, error: "This wallet has already claimed today. Try again in 24 hours." }, { status: 429 });
  }

  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "cdp_requestFaucetFunds",
        params: [{ address, token }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("Faucet RPC error:", data.error);
      return NextResponse.json(
        { ok: false, error: data.error.message || "Faucet request failed. Please try an external faucet." },
        { status: 502 }
      );
    }

    const txHash = data.result?.transactionHash || data.result;
    return NextResponse.json({ ok: true, txHash });
  } catch (err) {
    console.error("Faucet error:", err);
    return NextResponse.json({ ok: false, error: "Faucet service unavailable. Please try again later." }, { status: 503 });
  }
}
