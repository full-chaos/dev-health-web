import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy to forward /api/* and /graphql requests to the backend.
 * 
 * This runs at REQUEST TIME, so BACKEND_URL is read from the runtime environment,
 * not baked in at build time. This is critical for Docker deployments where
 * the backend URL varies per environment.
 */
export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Only proxy /api/* (except Next.js API routes) and /graphql
    const shouldProxy =
        pathname === "/graphql" ||
        (pathname.startsWith("/api/") && !pathname.startsWith("/api/v1/llm-proxy"));

    if (!shouldProxy) {
        return NextResponse.next();
    }

    // Read BACKEND_URL at runtime
    const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
    const targetUrl = new URL(pathname + request.nextUrl.search, backendUrl);

    // Rewrite the request to the backend
    return NextResponse.rewrite(targetUrl);
}

export const config = {
    matcher: ["/api/:path*", "/graphql"],
};
