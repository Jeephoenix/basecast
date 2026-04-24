import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";
export const runtime = "edge";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg,#6C63FF 0%,#4F46E5 60%,#FFD166 130%)",
          color: "#fff",
          fontSize: 38,
          fontWeight: 900,
          borderRadius: 14,
          fontFamily: "sans-serif",
          letterSpacing: -2,
        }}
      >
        BC
      </div>
    ),
    { ...size }
  );
}
