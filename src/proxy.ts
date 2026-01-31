import { NextRequest, NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/origin";
import { auth } from "@/lib/auth";

const PUBLIC_PATHS = [
    "/auth/signin",
    "/auth/error",
    "/api/auth",
    "/_next",
    "/favicon.ico",
    "/runtime-config.js",
];

function isPublicPath(pathname: string): boolean {
    return PUBLIC_PATHS.some(path => pathname.startsWith(path));
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (!isPublicPath(pathname)) {
        const session = await auth();
        if (!session) {
            const signInUrl = new URL("/auth/signin", request.url);
            signInUrl.searchParams.set("callbackUrl", pathname);
            return NextResponse.redirect(signInUrl);
        }
    }

    const shouldProxy =
        pathname === "/graphql" ||
        (pathname.startsWith("/api/") && !pathname.startsWith("/api/v1/llm-proxy"));

    if (!shouldProxy) {
        return NextResponse.next();
    }

    const backendUrl = getBackendUrl();
    const targetUrl = new URL(pathname + request.nextUrl.search, backendUrl);

    return NextResponse.rewrite(targetUrl);
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
