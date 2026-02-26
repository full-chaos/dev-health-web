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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.vercel.app;",
          },
        ],
      },
    ];
  },
  // API proxying is handled by proxy.ts at runtime (not baked at build time)
};

module.exports = nextConfig;
