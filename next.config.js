/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false, ws: false };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.ignoreWarnings = [
      { module: /node_modules\/@metamask\/sdk/ },
      { module: /node_modules\/@react-native-async-storage/ },
    ];
    return config;
  },
};
module.exports = nextConfig;
