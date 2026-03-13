import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/origin";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "proxy" });

const EXACT_PUBLIC_PATHS = [
    "/pricing",
    "/auth/signin",
    "/auth/signup",
    "/auth/error",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/health",
    "/favicon.ico",
    "/runtime-config.js",
    "/theme-init.js",
];

const PREFIX_PUBLIC_PATHS = ["/api/auth", "/api/v1/auth", "/_next"];

export function isPublicPath(pathname: string): boolean {
    if (pathname === "/") return true;
    if (EXACT_PUBLIC_PATHS.includes(pathname)) return true;
    return PREFIX_PUBLIC_PATHS.some(prefix => pathname.startsWith(prefix));
}

/** Ensure callback URLs are local-only to prevent open redirects. */
export function sanitizeCallbackUrl(url: string): string {
    if (url.startsWith("/") && !url.startsWith("//")) {
        return url;
    }
    return "/dashboard";
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
    const start = Date.now();
    const { method } = request;
    const { pathname } = request.nextUrl;

    const response = await handleRequest(request);

    log.info({ method, path: pathname, status: response.status, duration_ms: Date.now() - start }, "request");

    return response;
}

async function handleRequest(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Generate a per-request nonce and attach it so the layout can read it.
    const nonce = generateNonce();
    const csp = buildCspHeader(nonce);

    if (pathname === "/") {
        const session = await auth();
        if (session && session.access_token) {
            // Superadmins without an org belong in the admin panel, not the dashboard
            const target = (!session.user?.org_id && session.user?.is_superuser) ? "/superadmin" : "/dashboard";
            const redirect = NextResponse.redirect(new URL(target, request.url), 303);
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
    let isSuperuser = false;

    if (!isPublicPath(pathname)) {
        const session = await auth();
        if (!session || !session.access_token) {
            const signInUrl = new URL("/auth/signin", request.url);
            signInUrl.searchParams.set("callbackUrl", sanitizeCallbackUrl(pathname));
            const redirect = NextResponse.redirect(signInUrl, 303);
            redirect.headers.set("Content-Security-Policy", csp);
            return redirect;
        }
        accessToken = session.access_token;
        orgId = session.user?.org_id;
        isSuperuser = session.user?.is_superuser ?? false;
    }

    // Org-scoped route guard: routes outside /superadmin and /demo require an org.
    // Superadmins without an org are sent to the admin panel; regular users to onboarding.
    const ORG_EXEMPT_PATHS = ["/superadmin", "/demo"];
    const needsOrg = !isPublicPath(pathname) && !ORG_EXEMPT_PATHS.some(p => pathname.startsWith(p));

    if (needsOrg && !orgId) {
        const target = isSuperuser ? "/superadmin" : "/auth/onboard";
        const redirect = NextResponse.redirect(new URL(target, request.url), 303);
        redirect.headers.set("Content-Security-Policy", csp);
        return redirect;
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
