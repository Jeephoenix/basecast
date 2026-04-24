import { formatUnits } from "viem";

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactFmt = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export function fmtUsd(v, decimals = 6) {
  if (v == null) return "$0.00";
  const n = typeof v === "bigint"
    ? parseFloat(formatUnits(v < 0n ? -v : v, decimals))
    : Math.abs(Number(v));
  const sign = (typeof v === "bigint" ? v < 0n : Number(v) < 0) ? "-" : "";
  return sign + usdFmt.format(n);
}

export function fmtPnl(v, decimals = 6) {
  if (v == null) return "$0.00";
  const isBig = typeof v === "bigint";
  const isNeg = isBig ? v < 0n : Number(v) < 0;
  const n = isBig
    ? parseFloat(formatUnits(isNeg ? -v : v, decimals))
    : Math.abs(Number(v));
  return `${isNeg ? "-" : "+"}${usdFmt.format(n)}`;
}

export function fmtNum(n, opts) {
  if (n == null || Number.isNaN(Number(n))) return "0";
  return new Intl.NumberFormat("en-US", opts).format(Number(n));
}

export function fmtCompact(n) {
  if (n == null) return "0";
  return compactFmt.format(Number(n));
}

export function fmtFloat(n, digits = 4) {
  if (n == null || Number.isNaN(Number(n))) return "0";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(Number(n));
}

export function shortAddr(addr, head = 6, tail = 4) {
  if (!addr) return "";
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}
