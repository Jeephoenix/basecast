/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Babel is used via .babelrc — SWC minifier disabled for compatibility
  swcMinify: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // X-Frame-Options omitted: Replit preview pane requires iframe embedding
          { key: "X-Content-Type-Options",  value: "nosniff" },
          { key: "Referrer-Policy",         value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy",      value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false, ws: false };
    config.resolve.alias = {
      ...config.resolve.alias,
      "@react-native-async-storage/async-storage": false,
    };
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.ignoreWarnings = [
      { module: /node_modules\/@metamask\/sdk/ },
      { module: /node_modules\/@react-native-async-storage/ },
    ];
    return config;
  },
};
module.exports = nextConfig;
