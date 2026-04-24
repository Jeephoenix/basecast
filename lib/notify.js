"use client";

import { toast } from "sonner";

const CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || "84532");
const EXPLORER = CHAIN_ID === 8453 ? "https://basescan.org" : "https://sepolia.basescan.org";

export const notify = {
  success: (msg, opts) => toast.success(msg, opts),
  error:   (msg, opts) => toast.error(msg, opts),
  info:    (msg, opts) => toast(msg, opts),
  loading: (msg, opts) => toast.loading(msg, opts),
  dismiss: (id) => toast.dismiss(id),

  txPending: (msg = "Transaction submitted…") => toast.loading(msg),

  txSuccess: (id, { msg = "Transaction confirmed", hash } = {}) => {
    toast.success(msg, {
      id,
      action: hash ? { label: "View", onClick: () => window.open(`${EXPLORER}/tx/${hash}`, "_blank") } : undefined,
    });
  },

  txError: (id, err) => {
    const raw = err?.shortMessage || err?.message || "Transaction failed";
    toast.error(raw, { id });
  },
};

export { toast };
