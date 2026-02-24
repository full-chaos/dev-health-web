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
    "/api/v1/auth",
    "/_next",
    "/favicon.ico",
    "/runtime-config.js",
];

function isPublicPath(pathname: string): boolean {
    if (pathname === "/") return true;
    return PUBLIC_PATHS.some(path => path !== "/" && pathname.startsWith(path));
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (pathname === "/") {
        const session = await auth();
        if (session && session.access_token) {
            return NextResponse.redirect(new URL("/dashboard", request.url));
        }
        return NextResponse.next();
    }

    let accessToken: string | undefined;
    let orgId: string | undefined;

    if (!isTestMode && !isPublicPath(pathname)) {
        const session = await auth();
        if (!session || !session.access_token) {
            const signInUrl = new URL("/auth/signin", request.url);
            signInUrl.searchParams.set("callbackUrl", pathname);
            return NextResponse.redirect(signInUrl);
        }
        accessToken = session.access_token;
        orgId = session.user?.org_id;
    }

    const shouldProxy =
        pathname === "/graphql" ||
        (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth") && !pathname.startsWith("/api/v1/llm-proxy"));

    if (!shouldProxy) {
        return NextResponse.next();
    }

    const backendUrl = getBackendUrl();
    const targetUrl = new URL(pathname + request.nextUrl.search, backendUrl);

    if (accessToken) {
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("Authorization", `Bearer ${accessToken}`);
        if (orgId) {
            requestHeaders.set("X-Org-Id", orgId);
        }
        return NextResponse.rewrite(targetUrl, {
            request: { headers: requestHeaders },
        });
    }

    return NextResponse.rewrite(targetUrl);
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
