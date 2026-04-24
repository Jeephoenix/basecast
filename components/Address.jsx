"use client";

import { useBasename } from "@/lib/useBasename";
import { shortAddr } from "@/lib/format";

export default function Address({
  address,
  showAvatar = true,
  size = 18,
  monoFallback = true,
  truncate = false,
  head = 6,
  tail = 4,
  style,
}) {
  const { name, avatar } = useBasename(address);
  if (!address) return null;
  const display = name || shortAddr(address, head, tail);
  const isFallback = !name && monoFallback;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, ...style }}>
      {showAvatar && (
        avatar
          ? <img src={avatar} alt="" width={size} height={size} style={{ borderRadius: "50%", flexShrink: 0, objectFit: "cover" }} />
          : <span aria-hidden="true" style={{
              width: size, height: size, borderRadius: "50%", flexShrink: 0,
              background: `linear-gradient(135deg,#${address.slice(2,8)},#${address.slice(-6)})`,
            }} />
      )}
      <span
        title={address}
        className={isFallback ? "mono" : undefined}
        style={truncate ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : undefined}
      >
        {display}
      </span>
    </span>
  );
}
