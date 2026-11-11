import type { NextConfig } from "next";

const apiProxyTarget = (
  process.env.API_PROXY_TARGET?.trim() ||
  "https://factura-rdc-api.onrender.com/api"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async rewrites() {
    return [
      {
        source: "/api-proxy/:path*",
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
