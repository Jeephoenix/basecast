// app/layout.js
import { Providers } from "@/lib/wagmi";
import "@rainbow-me/rainbowkit/styles.css";

export const metadata = {
  title:       "BaseCast — Provably Fair Casino on Base",
  description: "On-chain casino powered by Pyth Entropy v2. CoinFlip, Dice Roll, and Bingo on Base blockchain.",
  metadataBase: new URL("https://www.basecast.org/"),
  keywords:    ["BaseCast", "crypto casino", "on-chain casino", "Base blockchain", "provably fair", "USDC casino", "CoinFlip", "DiceRoll", "Bingo", "Pyth Entropy"],
  authors:     [{ name: "BaseCast", url: "https://www.basecast.org" }],
  other: {
    "base:app_id": "69cd4bf319afd75ffc3d3b31",
  },
  openGraph: {
    title:       "BaseCast — Provably Fair Casino on Base",
    description: "On-chain casino powered by Pyth Entropy v2. CoinFlip, Dice Roll, and Bingo on Base blockchain.",
    url:         "https://www.basecast.org",
    siteName:    "BaseCast",
    images:      [{ url: "/og-image.png", width: 1200, height: 630, alt: "BaseCast — Provably Fair Casino on Base" }],
    type:        "website",
    locale:      "en_US",
  },
  twitter: {
    card:        "summary_large_image",
    site:        "@basecast_",
    creator:     "@basecast_",
    title:       "BaseCast — Provably Fair Casino on Base",
    description: "On-chain casino powered by Pyth Entropy v2. CoinFlip, Dice Roll, and Bingo on Base blockchain.",
    images:      ["/og-image.png"],
  },
  robots: {
    index:  true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any"/>
        <link rel="icon" href="/logo.png" type="image/png" sizes="512x512"/>
        <link rel="apple-touch-icon" href="/logo.png"/>
        <link rel="manifest" href="/site.webmanifest"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="theme-color" content="#6C63FF"/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Orbitron:wght@900&family=Courgette&display=swap" rel="stylesheet"/>
      </head>
      <body style={{ margin: 0, background: "#08090D" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
