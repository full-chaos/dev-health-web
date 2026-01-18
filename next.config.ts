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
  // API proxying is handled by middleware.ts at runtime (not baked at build time)
};

export default nextConfig;
