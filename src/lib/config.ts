export const config = {
  api: {
    // Use relative paths - Next.js rewrites proxy /api/* and /graphql to backend
    baseUrl: "",
    // Docs URL can be set via NEXT_PUBLIC_ env var for external links
    docsUrl: process.env.NEXT_PUBLIC_DOCS_URL || "/docs",
  },
};
