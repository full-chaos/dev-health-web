import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/origin";
import { auth } from "@/lib/auth";

const isTestMode = process.env.PLAYWRIGHT_TEST === "true";

const PUBLIC_PATHS = [
    "/",
    "/pricing",
    "/auth/signin",
    "/auth/signup",
    "/auth/error",
    "/api/auth",
    "/health",
    "/api/v1/auth",
    "/_next",
    "/favicon.ico",
    "/runtime-config.js",
    "/theme-init.js",
];

function isPublicPath(pathname: string): boolean {
    if (pathname === "/") return true;
    return PUBLIC_PATHS.some(path => path !== "/" && pathname.startsWith(path));
}

/**
 * Generate a cryptographically random nonce for Content-Security-Policy.
 * Returns a base64url-encoded 16-byte random value.
 */
function generateNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

/**
 * Build the Content-Security-Policy header value.
 *
 * unsafe-eval is intentionally excluded — Next.js 13+ App Router does not
 * require it. The nonce covers all first-party inline scripts (theme init,
 * runtime-config.js) so unsafe-inline is also removed from script-src.
 */
function buildCspHeader(nonce: string): string {
    return [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' https://*.vercel.app https://*.sentry.io",
        "frame-ancestors 'none'",
    ].join("; ");
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Generate a per-request nonce and attach it so the layout can read it.
    const nonce = generateNonce();
    const csp = buildCspHeader(nonce);

    if (pathname === "/") {
        const session = await auth();
        if (session && session.access_token) {
            const redirect = NextResponse.redirect(new URL("/dashboard", request.url));
            redirect.headers.set("x-nonce", nonce);
            redirect.headers.set("Content-Security-Policy", csp);
            return redirect;
        }
        const rootHeaders = new Headers(request.headers);
        rootHeaders.set("x-nonce", nonce);
        const response = NextResponse.next({ request: { headers: rootHeaders } });
        response.headers.set("x-nonce", nonce);
        response.headers.set("Content-Security-Policy", csp);
        return response;
    }

    let accessToken: string | undefined;
    let orgId: string | undefined;

    if (!isTestMode && !isPublicPath(pathname)) {
        const session = await auth();
        if (!session || !session.access_token) {
            const signInUrl = new URL("/auth/signin", request.url);
            signInUrl.searchParams.set("callbackUrl", pathname);
            const redirect = NextResponse.redirect(signInUrl);
            redirect.headers.set("Content-Security-Policy", csp);
            return redirect;
        }
        accessToken = session.access_token;
        orgId = session.user?.org_id;
    }

    const shouldProxy =
        pathname === "/graphql" ||
        (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth") && !pathname.startsWith("/api/v1/llm-proxy"));

    if (!shouldProxy) {
        const response = NextResponse.next({
            request: {
                headers: new Headers({
                    ...Object.fromEntries(request.headers),
                    "x-nonce": nonce,
                }),
            },
        });
        response.headers.set("x-nonce", nonce);
        response.headers.set("Content-Security-Policy", csp);
        return response;
    }

    const backendUrl = getBackendUrl();
    const targetUrl = new URL(pathname + request.nextUrl.search, backendUrl);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    if (accessToken) {
        requestHeaders.set("Authorization", `Bearer ${accessToken}`);
        if (orgId) {
            requestHeaders.set("X-Org-Id", orgId);
        }
    }

    const response = NextResponse.rewrite(targetUrl, {
        request: { headers: requestHeaders },
    });
    response.headers.set("x-nonce", nonce);
    response.headers.set("Content-Security-Policy", csp);
    return response;
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
