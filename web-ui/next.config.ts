// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Increase API route timeout for long-running Python processes
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Optional: Configure API route timeout
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          {
            key: "Access-Control-Allow-Headers",
            value: "X-Requested-With, Content-Type, Authorization",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
