"use client";
// lib/wagmi.js
import { getDefaultConfig }    from "@rainbow-me/rainbowkit";
import { base, baseSepolia }   from "wagmi/chains";
import { http }                from "wagmi";
import { WagmiProvider }       from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme }    from "@rainbow-me/rainbowkit";

export const config = getDefaultConfig({
  appName:   "BaseCast",
  appUrl:    "https://basecast.netlify.app",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo",
  chains:    [base, baseSepolia],
  transports: {
    [base.id]:        http(process.env.NEXT_PUBLIC_BASE_RPC        || "https://mainnet.base.org"),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC || "https://sepolia.base.org"),
  },
});

const queryClient = new QueryClient();

export function Providers({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor:           "#2563EB",
            accentColorForeground: "white",
            borderRadius:          "medium",
          })}
          modalSize="compact"
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
