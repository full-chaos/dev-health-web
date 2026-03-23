// @ts-check
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withSentryConfig } = require("@sentry/nextjs");

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
            // Static-export / CDN fallback CSP (no middleware nonce available).
            // unsafe-eval is intentionally excluded. Middleware injects a
            // per-request nonce-based CSP for all server-rendered routes.
            // unsafe-inline here covers only the static export path where
            // middleware does not run.
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.vercel.app https://*.sentry.io https://bugs.fullchaos.dev; frame-ancestors 'none';",
          },
        ],
      },
    ];
  },
  // API proxying is handled by proxy.ts at runtime (not baked at build time)
};

module.exports = withSentryConfig(nextConfig, {
  // Proxy Sentry requests through Next.js to avoid CSP / DNS issues
  tunnelRoute: "/monitoring",
  // Suppress source map upload logs during build
  silent: !process.env.CI,
  // Upload source maps only when SENTRY_AUTH_TOKEN is set
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Webpack-specific options
  webpack: {
    // Tree-shake Sentry logger statements to reduce bundle size
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
