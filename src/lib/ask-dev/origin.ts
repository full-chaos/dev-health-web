/**
 * Same-origin check for the one mutating Ask Dev call (CSRF). The browser sends `Origin` with every
 * cross-site POST and with its own same-origin POSTs, so a missing or different `Origin` is refused.
 * The expected origin is `AUTH_URL` / `NEXTAUTH_URL` when set (behind a proxy the request URL is
 * internal), else the request's own origin: the same rule as `POST /api/acr/device`.
 */
function originOf(value: string | null): string | undefined {
    if (value === null) return undefined;
    try {
        return new URL(value).origin;
    } catch {
        return undefined;
    }
}

function expectedOrigin(request: Request): string {
    const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
    if (configured !== undefined) return originOf(configured) ?? "";
    return new URL(request.url).origin;
}

export function isSameOriginRequest(request: Request): boolean {
    const origin = originOf(request.headers.get("origin"));
    return origin !== undefined && origin === expectedOrigin(request);
}
