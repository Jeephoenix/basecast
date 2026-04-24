// app/layout.js
import { Inter, JetBrains_Mono, Orbitron } from "next/font/google";
import { Providers } from "@/lib/wagmi";
import { Toaster } from "sonner";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});
const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["900"],
  variable: "--font-orbitron",
  display: "swap",
});

export const metadata = {
  title:       "BaseCast — Provably Fair Casino on Base",
  description: "Provably fair, non-custodial casino on Base. Powered by Pyth Entropy v2 — every result is verifiable on-chain. Play Coin Flip, Dice Roll & Bingo with instant USDC payouts.",
  metadataBase: new URL("https://www.basecast.org/"),
  keywords:    ["BaseCast", "crypto casino", "on-chain casino", "Base blockchain", "provably fair", "USDC casino", "CoinFlip", "DiceRoll", "Bingo", "Pyth Entropy"],
  authors:     [{ name: "BaseCast", url: "https://www.basecast.org" }],
  manifest:    "/site.webmanifest",
  other: {
    "base:app_id": "69cd4bf319afd75ffc3d3b31",
  },
  openGraph: {
    title:       "BaseCast — Provably Fair Casino on Base",
    description: "Provably fair, non-custodial casino on Base. Powered by Pyth Entropy v2 — every result is verifiable on-chain. Play Coin Flip, Dice Roll & Bingo with instant USDC payouts.",
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
    description: "Provably fair, non-custodial casino on Base. Powered by Pyth Entropy v2 — every result is verifiable on-chain. Play Coin Flip, Dice Roll & Bingo with instant USDC payouts.",
    images:      ["/og-image.png"],
  },
  robots: {
    index:  true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logo.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/logo.png",
  },
};

export const viewport = {
  themeColor: "#6C63FF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable} ${orbitron.variable}`}>
      <body style={{ margin: 0, background: "#08090D" }}>
        <Providers>{children}</Providers>
        <Toaster
          theme="dark"
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              background: "rgba(15,18,38,0.96)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#F0F2FF",
              backdropFilter: "blur(12px)",
            },
          }}
        />
      </body>
    </html>
  );
}
