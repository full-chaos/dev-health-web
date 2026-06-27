/**
 * CHAOS-2676 return-target hardening (shared by the GitHub App install +
 * callback routes).
 *
 * `return_to` is attacker-influenceable (query param on install, backend
 * response body on callback). Only a single-leading-slash, same-origin absolute
 * path is allowed. We reject everything else so a crafted value can never become
 * an open redirect when later resolved against our origin via `new URL()`.
 *
 * Rejected:
 *  - empty / non-string / values not starting with `/`
 *  - protocol-relative `//host`
 *  - backslash forms like `/\\host` or `/\\/host` — WHATWG URL parsing treats
 *    `\` as `/`, so `new URL("/\\evil.example/p", origin)` resolves to
 *    `https://evil.example/p`
 *  - CR / LF / tab and any other C0 control char or DEL (header/redirect
 *    splitting, smuggling)
 *
 * The caller MUST still assert `url.origin === ourOrigin` after constructing the
 * redirect URL — this function is the first line of defense, not the only one.
 */
// Matches C0 control characters (incl. CR/LF/tab), DEL, and backslash.
const UNSAFE_RETURN_TO = /[\u0000-\u001f\u007f\\]/;

export function safeReturnTo(value: string | null | undefined): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }
    // Require exactly one leading slash: rejects "", non-"/", and "//host".
    if (!value.startsWith("/") || value.startsWith("//")) {
        return undefined;
    }
    if (UNSAFE_RETURN_TO.test(value)) {
        return undefined;
    }
    return value;
}
