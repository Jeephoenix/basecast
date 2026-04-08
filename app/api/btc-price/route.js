/**
 * /api/btc-price
 * Server-side proxy to Binance REST API for initial BTC/USD price load.
 * Avoids any CORS issues on the client for the first paint.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Binance ${res.status}`);
    const json = await res.json();
    return Response.json({ price: parseFloat(json.price) });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}
