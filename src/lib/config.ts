export const config = {
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
    docsUrl: process.env.NEXT_PUBLIC_API_DOCS_URL || "http://localhost:8000/docs",
  },
};
