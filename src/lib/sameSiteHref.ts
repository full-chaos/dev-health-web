const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

/**
 * Returns a same-site path (`/path?query#hash`) or null. Accepts a relative
 * path with a single leading "/" or an absolute http(s) URL whose origin equals
 * `appOrigin`. Everything else (other origins, "//host", "/\host", "javascript:")
 * is refused.
 */
export function toSameSiteHref(target: string, appOrigin?: string): string | null {
    if (typeof target !== "string" || CONTROL_OR_BACKSLASH.test(target)) return null;
    if (target.startsWith("/")) {
        return target.startsWith("//") ? null : target;
    }
    if (!appOrigin) return null;
    try {
        const url = new URL(target);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        if (url.origin !== new URL(appOrigin).origin) return null;
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return null;
    }
}
