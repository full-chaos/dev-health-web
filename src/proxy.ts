import { NextRequest, NextResponse } from "next/server";
import { getClientIp, isTrustProxyEnabled } from "@/lib/client-ip";
import { getServerEnv } from "@/lib/config";
import { getBackendUrl } from "@/lib/origin";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { checkRateLimit, type RateLimitOptions } from "@/lib/rate-limit";

const log = logger.child({ module: "proxy" });

if (process.env.DEV_HEALTH_TEST_MODE === "true" && process.env.NODE_ENV === "production") {
    throw new Error("DEV_HEALTH_TEST_MODE must not be enabled in production");
}

const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

const ROUTE_LIMITS: Array<{
    match: (method: string, pathname: string) => boolean;
    opts: RateLimitOptions;
}> = [
    {
        match: (method, pathname) => method === "POST" && pathname.startsWith("/api/v1/auth/login"),
        opts: { failClosed: true, namespace: "auth-login", windowMs: 15 * 60_000, maxRequests: 10 },
    },
    {
        match: (method, pathname) =>
            method === "POST" &&
            (pathname.startsWith("/api/v1/auth/forgot-password") ||
                pathname.startsWith("/api/v1/auth/password-reset")),
        opts: {
            failClosed: true,
            namespace: "auth-pwreset",
            windowMs: 60 * 60_000,
            maxRequests: 3,
        },
    },
    {
        match: (method, pathname) =>
            method === "POST" && pathname.startsWith("/api/v1/auth/register"),
        opts: {
            failClosed: true,
            namespace: "auth-register",
            windowMs: 60 * 60_000,
            maxRequests: 5,
        },
    },
    {
        match: (method, pathname) =>
            MUTATING_METHODS.includes(method) && pathname.startsWith("/api/v1/auth/"),
        opts: { failClosed: true, namespace: "auth-other", windowMs: 15 * 60_000, maxRequests: 20 },
    },
    {
        match: (method, pathname) =>
            method === "POST" && pathname.startsWith("/api/v1/admin/credentials/test-connection"),
        opts: {
            failClosed: true,
            namespace: "admin-cred-test",
            windowMs: 60 * 60_000,
            maxRequests: 10,
        },
    },
    {
        // Token issuance abuse guard (CHAOS-2714 D2/D9). Console-push has no
        // ROUTE_LIMITS entry — the console-push proxy was cut from v1 (Screen
        // 5 is validate-only; the write path stays exclusively token-authed).
        match: (method, pathname) => method === "POST" && isCustomerPushTokenIssuancePath(pathname),
        opts: {
            failClosed: true,
            namespace: "admin-customer-push-token-issue",
            windowMs: 60 * 60_000,
            maxRequests: 20,
        },
    },
];

const EXACT_PUBLIC_PATHS = [
    "/pricing",
    "/privacy",
    "/terms",
    "/auth/signin",
    "/auth/signup",
    "/auth/verify",
    "/auth/error",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/health",
    "/favicon.ico",
    "/apple-icon.png",
    "/opengraph-image.png",
    "/runtime-config.js",
    "/theme-init.js",
    "/robots.txt",
    "/sitemap.xml",
];

const PREFIX_PUBLIC_PATHS = ["/api/auth", "/api/v1/auth", "/_next", "/marketing"];

export function isPublicPath(pathname: string): boolean {
    if (pathname === "/") return true;
    if (EXACT_PUBLIC_PATHS.includes(pathname)) return true;
    return PREFIX_PUBLIC_PATHS.some((prefix) => pathname.startsWith(prefix));
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
        "connect-src 'self' https://*.vercel.app https://*.sentry.io https://bugs.fullchaos.dev http://localhost:8800",
        "frame-ancestors 'none'",
    ].join("; ");
}

/** POST .../sources/:id/tokens (create) or POST .../tokens/:id/rotate. */
function isCustomerPushTokenIssuancePath(pathname: string): boolean {
    return (
        pathname.startsWith("/api/v1/admin/customer-push/") &&
        (/\/sources\/[^/]+\/tokens$/.test(pathname) || /\/tokens\/[^/]+\/rotate$/.test(pathname))
    );
}

function pathBucket(pathname: string): string {
    if (pathname.startsWith("/api/v1/auth/login")) return "auth-login";
    if (
        pathname.startsWith("/api/v1/auth/forgot-password") ||
        pathname.startsWith("/api/v1/auth/password-reset")
    )
        return "auth-pwreset";
    if (pathname.startsWith("/api/v1/auth/register")) return "auth-register";
    if (pathname.startsWith("/api/v1/auth/")) return "auth-other";
    if (pathname.startsWith("/api/v1/admin/credentials/test-connection"))
        return "admin-credentials-test-connection";
    // Bucket by route shape, not the dynamic source/token id in the path —
    // otherwise rotating across ids would reset the counter per id.
    if (isCustomerPushTokenIssuancePath(pathname)) return "admin-customer-push-token-issue";
    return pathname;
}

function shouldBypassProxyRateLimit(): boolean {
    return process.env.DEV_HEALTH_TEST_MODE === "true" && process.env.NODE_ENV !== "production";
}

async function enforceProxyRateLimit(
    request: NextRequest,
    sessionUserId: string | undefined,
): Promise<NextResponse | null> {
    if (shouldBypassProxyRateLimit()) return null;

    const { method } = request;
    const { pathname } = request.nextUrl;
    const routeLimit = ROUTE_LIMITS.find(({ match }) => match(method, pathname));
    if (!routeLimit) return null;

    const env = getServerEnv();
    const clientIp = getClientIp(request, { trustProxy: isTrustProxyEnabled(env.TRUST_PROXY) });
    const bucket = pathBucket(pathname);
    const isUserKeyed =
        pathname.startsWith("/api/v1/admin/credentials/test-connection") ||
        isCustomerPushTokenIssuancePath(pathname);
    const identity = isUserKeyed ? `user:${sessionUserId ?? `ip:${clientIp}`}` : `ip:${clientIp}`;
    const key = `proxy:${method}:${bucket}:${identity}`;
    const result = await checkRateLimit(key, routeLimit.opts);

    if (!result.limited) return null;

    const response = NextResponse.json(
        { detail: "Rate limit exceeded", retry_after: result.retryAfter },
        { status: 429 },
    );
    response.headers.set("Retry-After", String(result.retryAfter));
    return response;
}

export async function proxy(request: NextRequest) {
    const start = Date.now();
    const { method } = request;
    const { pathname } = request.nextUrl;

    const response = await handleRequest(request);

    log.info(
        { method, path: pathname, status: response.status, duration_ms: Date.now() - start },
        "request",
    );

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
            const target =
                !session.user?.org_id && session.user?.is_superuser ? "/superadmin" : "/dashboard";
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
    let sessionUserId: string | undefined;
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
        sessionUserId = session.user?.id;
        orgId = session.user?.org_id;
        isSuperuser = session.user?.is_superuser ?? false;
    }

    // Org-scoped route guard: routes outside /superadmin and /demo require an org.
    // Superadmins without an org are sent to the admin panel; regular users to onboarding.
    const ORG_EXEMPT_PATHS = ["/superadmin", "/demo", "/auth/onboard", "/settings"];
    const needsOrg =
        !isPublicPath(pathname) && !ORG_EXEMPT_PATHS.some((p) => pathname.startsWith(p));

    if (needsOrg && !orgId) {
        const target = isSuperuser ? "/superadmin" : "/auth/onboard";
        const redirect = NextResponse.redirect(new URL(target, request.url), 303);
        redirect.headers.set("Content-Security-Policy", csp);
        return redirect;
    }

    const rateLimitResponse = await enforceProxyRateLimit(request, sessionUserId);
    if (rateLimitResponse) {
        rateLimitResponse.headers.set("Content-Security-Policy", csp);
        return rateLimitResponse;
    }

    const shouldProxy =
        pathname === "/graphql" ||
        (pathname.startsWith("/api/") &&
            !pathname.startsWith("/api/auth") &&
            !pathname.startsWith("/api/v1/llm-proxy"));

    if (!shouldProxy) {
        const response = NextResponse.next({
            request: {
                headers: new Headers({
                    ...Object.fromEntries(request.headers),
                    "x-nonce": nonce,
                    "x-dev-health-path": pathname + request.nextUrl.search,
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
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
