"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http, namehash, encodePacked, keccak256 } from "viem";
import { base, mainnet } from "viem/chains";
import { shortAddr } from "./format";

// Basenames L2 resolver (Base Mainnet)
const BASENAME_L2_RESOLVER = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD";
const BASE_REVERSE_NODE = "0x08d9b0993eb8c4da57c37a4b84a6e384c2623114ff4e9370ed51c9b8935109ba";

const RESOLVER_ABI = [
  { name: "name",   type: "function", stateMutability: "view", inputs: [{ name: "node", type: "bytes32" }], outputs: [{ type: "string" }] },
  { name: "addr",   type: "function", stateMutability: "view", inputs: [{ name: "node", type: "bytes32" }], outputs: [{ type: "address" }] },
  { name: "text",   type: "function", stateMutability: "view", inputs: [{ name: "node", type: "bytes32" }, { name: "key", type: "string" }], outputs: [{ type: "string" }] },
];

const baseClient = createPublicClient({ chain: base,    transport: http() });
const ethClient  = createPublicClient({ chain: mainnet, transport: http() });

const cache = new Map();
const inflight = new Map();

function reverseNode(addr) {
  const sub = keccak256(encodePacked(["string"], [addr.slice(2).toLowerCase()]));
  return keccak256(encodePacked(["bytes32", "bytes32"], [BASE_REVERSE_NODE, sub]));
}

async function resolveBasename(addr) {
  try {
    const node = reverseNode(addr);
    const name = await baseClient.readContract({
      address: BASENAME_L2_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: "name",
      args: [node],
    });
    if (!name) return null;
    let avatar = null;
    try {
      avatar = await baseClient.readContract({
        address: BASENAME_L2_RESOLVER,
        abi: RESOLVER_ABI,
        functionName: "text",
        args: [namehash(name), "avatar"],
      });
    } catch {}
    return { name, avatar: avatar || null };
  } catch {
    return null;
  }
}

async function resolveEns(addr) {
  try {
    const name = await ethClient.getEnsName({ address: addr });
    if (!name) return null;
    let avatar = null;
    try { avatar = await ethClient.getEnsAvatar({ name }); } catch {}
    return { name, avatar: avatar || null };
  } catch {
    return null;
  }
}

async function resolve(addr) {
  const lower = addr.toLowerCase();
  if (cache.has(lower)) return cache.get(lower);
  if (inflight.has(lower)) return inflight.get(lower);

  const p = (async () => {
    const fromBase = await resolveBasename(addr);
    if (fromBase) { cache.set(lower, fromBase); return fromBase; }
    const fromEns = await resolveEns(addr);
    const result = fromEns || { name: null, avatar: null };
    cache.set(lower, result);
    return result;
  })();

  inflight.set(lower, p);
  try { return await p; } finally { inflight.delete(lower); }
}

export function useBasename(addr) {
  const [data, setData] = useState(() =>
    addr && cache.has(addr.toLowerCase()) ? cache.get(addr.toLowerCase()) : { name: null, avatar: null }
  );
  useEffect(() => {
    if (!addr) return;
    let alive = true;
    resolve(addr).then(d => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [addr]);
  return data;
}

export function useDisplayName(addr, fallbackHead = 6, fallbackTail = 4) {
  const { name } = useBasename(addr);
  if (name) return name;
  if (!addr) return "";
  return shortAddr(addr, fallbackHead, fallbackTail);
}
