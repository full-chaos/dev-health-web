/** @type {import("next").NextConfig} */
const nextConfig = {
  ...(process.env.DEMO_EXPORT === "true"
    ? {
        output: "export",
        trailingSlash: true,
        pageExtensions: ["demo.tsx", "demo.ts", "demo.jsx", "demo.js"],
        images: { unoptimized: true },
        ...(process.env.BASE_PATH
          ? {
              basePath: process.env.BASE_PATH,
              assetPrefix: process.env.BASE_PATH,
            }
          : {}),
      }
    : {
        pageExtensions: ["tsx", "ts", "jsx", "js"],
      }),
  // API proxying is handled by middleware.ts at runtime (not baked at build time)
};

module.exports = nextConfig;
