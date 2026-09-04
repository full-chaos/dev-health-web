import { safeReturnTo } from "@/lib/onboarding/returnTo";

function isBlockedAuthPath(target: string): boolean {
    const pathname = target.split(/[?#]/, 1)[0];
    return (
        pathname === "/auth" ||
        pathname.startsWith("/auth/") ||
        pathname === "/login" ||
        pathname.startsWith("/login/")
    );
}

/**
 * Post-login redirect targets must remain local and must not bounce users back
 * onto a login surface.
 */
export function safePostLoginRedirect(value: string | null | undefined): string | undefined {
    const target = safeReturnTo(value);
    if (!target || isBlockedAuthPath(target)) {
        return undefined;
    }
    return target;
}

export function appendCallbackUrl(href: string, callbackUrl: string | undefined): string {
    if (!callbackUrl) return href;
    const url = new URL(href, "http://localhost");
    url.searchParams.set("callbackUrl", callbackUrl);
    return `${url.pathname}${url.search}`;
}
