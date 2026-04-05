"use client";
import { useState, useEffect } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits } from "viem";

const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS;

const USDC_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
];

// ETH price feed — using a simple public API
async function fetchEthPrice() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
    );
    const data = await res.json();
    return data.ethereum.usd;
  } catch {
    return null;
  }
}

export default function WalletTab() {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const [usdcBalance, setUsdcBalance] = useState(null);   // raw bigint
  const [ethBalance, setEthBalance] = useState(null);     // raw bigint (wei)
  const [ethPrice, setEthPrice] = useState(null);         // number (USD)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address || !publicClient) return;

    async function load() {
      setLoading(true);
      try {
        const [usdc, eth, price] = await Promise.all([
          publicClient.readContract({
            address: USDC_ADDRESS,
            abi: USDC_ABI,
            functionName: "balanceOf",
            args: [address],
          }),
          publicClient.getBalance({ address }),
          fetchEthPrice(),
        ]);
        setUsdcBalance(usdc);
        setEthBalance(eth);
        setEthPrice(price);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }

    load();
  }, [address, publicClient]);

  const usdcUsd = usdcBalance != null
    ? parseFloat(formatUnits(usdcBalance, 6))
    : 0;

  const ethAmount = ethBalance != null
    ? parseFloat(formatUnits(ethBalance, 18))
    : 0;

  const ethUsd = ethPrice != null ? ethAmount * ethPrice : 0;

  const totalUsd = (usdcUsd + ethUsd).toFixed(2);

  if (!address) {
    return (
      <div style={{ padding: "24px", textAlign: "center", color: "var(--sub)" }}>
        Connect your wallet to see balances.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "24px", textAlign: "center", color: "var(--sub)" }}>
        Loading wallet…
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Overall value */}
      <div style={{
        background: "var(--s2)", border: "1.5px solid var(--bd)", borderRadius: "14px",
        padding: "20px", textAlign: "center"
      }}>
        <div style={{ fontSize: "13px", color: "var(--sub)", marginBottom: "6px" }}>
          Total Wallet Value
        </div>
        <div style={{ fontSize: "32px", fontWeight: "700", color: "var(--tx)" }}>
          ~${totalUsd} USD
        </div>
        <div style={{ fontSize: "12px", color: "var(--sub)", marginTop: "4px" }}>
          {address.slice(0,6)}...{address.slice(-4)}
        </div>
      </div>

      {/* Trading tokens */}
      <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--sub)", textTransform: "uppercase", letterSpacing: "1px" }}>
        Trading Tokens
      </div>
      <div style={{
        background: "var(--s2)", border: "1.5px solid var(--bd)", borderRadius: "12px", padding: "16px",
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "50%",
            background: "linear-gradient(135deg,#2775CA,#6C63FF)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: "700", fontSize: "13px", color: "#fff"
          }}>$</div>
          <div>
            <div style={{ fontWeight: "600", color: "var(--tx)" }}>USDC</div>
            <div style={{ fontSize: "12px", color: "var(--sub)" }}>$1.00</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: "600", color: "var(--tx)" }}>${usdcUsd.toFixed(4)}</div>
          <div style={{ fontSize: "12px", color: "var(--sub)" }}>{usdcUsd.toFixed(4)} USDC</div>
        </div>
      </div>

      {/* Holding tokens */}
      <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--sub)", textTransform: "uppercase", letterSpacing: "1px" }}>
        Holding Tokens
      </div>
      <div style={{
        background: "var(--s2)", border: "1.5px solid var(--bd)", borderRadius: "12px", padding: "16px",
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "50%",
            background: "linear-gradient(135deg,#627EEA,#8FA8F8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: "700", fontSize: "13px", color: "#fff"
          }}>Ξ</div>
          <div>
            <div style={{ fontWeight: "600", color: "var(--tx)" }}>ETH</div>
            <div style={{ fontSize: "12px", color: "var(--sub)" }}>
              {ethPrice != null ? `$${ethPrice.toLocaleString()}` : "—"}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: "600", color: "var(--tx)" }}>${ethUsd.toFixed(4)}</div>
          <div style={{ fontSize: "12px", color: "var(--sub)" }}>{ethAmount.toFixed(6)} ETH</div>
        </div>
      </div>
    </div>
  );
      }
