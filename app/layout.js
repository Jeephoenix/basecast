// app/layout.js
import { Providers } from "@/lib/wagmi";
import "@rainbow-me/rainbowkit/styles.css";

export const metadata = {
  title:       "BaseCast — Provably Fair Casino on Base",
  description: "On-chain casino powered by Pyth Entropy v2. CoinFlip + Dice + Bingo on Base.",
  metadataBase: new URL("https://www.basecast.org/"),
  other: {
    "base:app_id": "69cd4bf319afd75ffc3d3b31",
  },
  openGraph: {
    title:       "BaseCast",
    description: "Provably Fair On-Chain Casino on Base",
    images:      ["/og-image.png"],
    type:        "website",
  },
  twitter: {
    card:        "summary_large_image",
    title:       "BaseCast",
    description: "Provably Fair On-Chain Casino on Base",
    images:      ["/og-image.png"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
      </head>
      <body style={{ margin: 0, background: "#08090D" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
