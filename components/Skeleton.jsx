"use client";

export function Skeleton({ width = "100%", height = 14, radius = 6, style }) {
  return (
    <span
      className="skeleton"
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

export function SkeletonRow({ count = 3, height = 44, gap = 8 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={height} radius={10} />
      ))}
    </div>
  );
}
