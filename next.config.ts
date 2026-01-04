import type { NextConfig } from "next";

const isDemoExport = process.env.DEMO_EXPORT === "true";
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  ...(isDemoExport
    ? {
      output: "export",
      trailingSlash: true,
      pageExtensions: ["demo.tsx", "demo.ts", "demo.jsx", "demo.js"],
      images: { unoptimized: true },
      ...(basePath
        ? {
          basePath,
          assetPrefix: basePath,
        }
        : {}),
    }
    : {
      pageExtensions: ["tsx", "ts", "jsx", "js"],
    }),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://127.0.0.1:8000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
