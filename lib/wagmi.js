// lib/wagmi.js
// ─────────────────────────────────────────────────────────────────────────────
// wagmi v2 + RainbowKit configuration for BaseCast
// Base Mainnet primary, Base Sepolia for testing
// ─────────────────────────────────────────────────────────────────────────────

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia } from "wagmi/chains";
import { http } from "wagmi";

export const config = getDefaultConfig({
  appName:        "BaseCast",
  appDescription: "Provably Fair On-Chain Casino on Base",
  appUrl:         "https://basecast.xyz",
  appIcon:        "https://basecast.xyz/icon.png",

  // Wallet Connect project ID — get free at https://cloud.walletconnect.com
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID",

  chains: [base, baseSepolia],

  transports: {
    [base.id]:        http(process.env.NEXT_PUBLIC_BASE_RPC || "https://mainnet.base.org"),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || "https://sepolia.base.org"),
  },
});


// ─────────────────────────────────────────────────────────────────────────────
// app/providers.jsx — wrap your Next.js app with this
// ─────────────────────────────────────────────────────────────────────────────
// Usage in app/layout.js:
//
//   import { Providers } from "@/lib/wagmi";
//   export default function RootLayout({ children }) {
//     return (
//       <html>
//         <body>
//           <Providers>{children}</Providers>
//         </body>
//       </html>
//     );
//   }
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider }                 from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@rainbow-me/rainbowkit/styles.css";

const queryClient = new QueryClient();

export function Providers({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor:          "#0052FF",
            accentColorForeground:"white",
            borderRadius:         "medium",
            fontStack:            "system",
            overlayBlur:          "small",
          })}
          modalSize="compact"
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
