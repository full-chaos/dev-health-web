// @ts-check
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withSentryConfig } = require("@sentry/nextjs");

const isDemoExportBuild =
    process.env.DEMO_EXPORT === "true" && process.env.NODE_ENV === "production";

/** @type {import("next").NextConfig} */
const nextConfig = {
    // Allow an isolated build/output directory per process. The Playwright e2e
    // suite runs two `next dev` servers against the same source tree (default
    // single-page onboarding on one port, guided first-run flow on another);
    // giving each its own `.next` directory via NEXT_DIST_DIR prevents the two
    // dev compilers from racing on shared build artifacts. Unset in normal
    // builds, so production output is unaffected.
    ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
    ...(isDemoExportBuild
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
              output: "standalone",
              pageExtensions: ["tsx", "ts", "jsx", "js"],
              // size-sensor (transitive via echarts-for-react) is flagged as malware
              // (GHSA-gx6x-v325-85g4). Resolve all `size-sensor` imports to a local
              // ResizeObserver-backed stub so the npm dependency is never installed.
              turbopack: {
                  resolveAlias: {
                      "size-sensor": "./vendor/size-sensor-stub/index.js",
                  },
              },
          }),
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=()",
                    },
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
                        value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.vercel.app https://*.sentry.io https://bugs.fullchaos.dev; frame-ancestors 'none';",
                    },
                ],
            },
        ];
    },
    async redirects() {
        // 301 redirects for legacy URLs that lived at the root before the
        // `(marketing)` route group was split out of `/marketing/*`. Preserves
        // external/bookmarked links so nothing 404s. Keep these in sync with
        // every page that moves under `src/app/marketing/`.
        return [
            { source: "/admin", destination: "/org/admin", permanent: true },
            {
                source: "/admin/:path*",
                destination: "/org/admin/:path*",
                permanent: true,
            },
            {
                source: "/pricing",
                destination: "/marketing/pricing",
                permanent: true,
            },
            {
                source: "/privacy",
                destination: "/marketing/privacy",
                permanent: true,
            },
            { source: "/terms", destination: "/marketing/terms", permanent: true },
            {
                source: "/vp-engineering",
                destination: "/marketing/vp-engineering",
                permanent: true,
            },
            {
                source: "/platform-devex",
                destination: "/marketing/platform-devex",
                permanent: true,
            },
            {
                source: "/engineering-manager",
                destination: "/marketing/engineering-manager",
                permanent: true,
            },
            {
                source: "/cto-architecture",
                destination: "/marketing/cto-architecture",
                permanent: true,
            },
            {
                source: "/billing-refunds-test",
                destination: "/marketing/billing-refunds-test",
                permanent: true,
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
