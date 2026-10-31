/**
 * Where ACR's browser tokens may appear (CHAOS-12304, c3 of the T13 split; design §7). The secret
 * boundary spec records what a page sends, receives, logs and stores, and this checker names each
 * place a token is where it must not be.
 *
 * - The access token `fcacr_`: only in `Authorization: Bearer` on requests to the ACR origin, and
 *   in `/token` response bodies.
 * - The refresh token `acrrt_`: only in `/token` and `/revoke` request bodies, `/token` response
 *   bodies, and this tab's family entry in `sessionStorage` (`ask-dev:acr-family`).
 * - Neither one ever in a URL, a request to another origin (web's own API and telemetry included),
 *   `localStorage`, or the console.
 *
 * A token is matched by its prefix and at least one token character, so a short planted value is
 * caught too. The shapes in code (`fcacr_[A-Za-z0-9_-]{43}`) are not tokens: `[` is not a token
 * character.
 */

export type Observed =
    | {
          readonly kind: "request";
          readonly url: string;
          readonly method: string;
          readonly headers: Record<string, string>;
          readonly body: string;
      }
    | {
          readonly kind: "response";
          readonly url: string;
          readonly status: number;
          readonly headers: Record<string, string>;
          readonly body: string;
      }
    | { readonly kind: "console"; readonly text: string }
    | {
          readonly kind: "storage";
          readonly area: "local" | "session";
          readonly key: string;
          readonly value: string;
      };

export type AcrEndpoints = {
    readonly issuer: string;
    readonly tokenEndpoint: string;
    readonly revocationEndpoint: string;
};

const ACCESS = /fcacr_[A-Za-z0-9_-]/u;
const ACCESS_ALL = /fcacr_[A-Za-z0-9_-]+/gu;
const REFRESH = /acrrt_[A-Za-z0-9_-]/u;
const FAMILY_KEY = "ask-dev:acr-family";

/**
 * A text as sent, plus up to two percent-decodings of it (r3 on web #1665): an encoded or twice
 * encoded token in a URL, a body or a header is the same leak. A malformed escape is decoded one
 * `%XX` at a time instead of failing.
 */
function seen(text: string): string {
    const forms = [text];
    let current = text;
    for (let round = 0; round < 2; round += 1) {
        let next: string;
        try {
            next = decodeURIComponent(current);
        } catch {
            next = current.replace(/%([0-9a-f]{2})/giu, (_, hex: string) =>
                String.fromCharCode(Number.parseInt(hex, 16)),
            );
        }
        if (next === current) break;
        forms.push(next);
        current = next;
    }
    return forms.join("\n");
}

const hasAccess = (text: string): boolean => ACCESS.test(seen(text));
const hasRefresh = (text: string): boolean => REFRESH.test(seen(text));

function sameEndpoint(url: string, endpoint: string): boolean {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}` === endpoint;
}

function originOf(url: string): string {
    return new URL(url).origin;
}

function requestViolations(
    observed: Extract<Observed, { kind: "request" }>,
    acr: AcrEndpoints,
    out: Set<string>,
) {
    if (hasAccess(observed.url)) out.add("access token in a URL");
    if (hasRefresh(observed.url)) out.add("refresh token in a URL");
    const toAcr = originOf(observed.url) === acr.issuer;
    for (const [name, value] of Object.entries(observed.headers)) {
        // A header name is checked as well as its value (r1 on web #1665).
        if (hasAccess(name)) {
            out.add(
                toAcr ? "access token outside Authorization" : "access token to another origin",
            );
        }
        if (hasRefresh(name)) out.add("refresh token in a request header");
        if (hasAccess(value)) {
            const bearer =
                name.toLowerCase() === "authorization" &&
                /^Bearer fcacr_[A-Za-z0-9_-]+$/u.test(value);
            if (!toAcr) out.add("access token to another origin");
            else if (!bearer) out.add("access token outside Authorization");
        }
        if (hasRefresh(value)) out.add("refresh token in a request header");
    }
    if (hasAccess(observed.body)) {
        out.add(toAcr ? "access token in a request body" : "access token to another origin");
    }
    if (hasRefresh(observed.body)) {
        const tokenOrRevoke =
            observed.method === "POST" &&
            (sameEndpoint(observed.url, acr.tokenEndpoint) ||
                sameEndpoint(observed.url, acr.revocationEndpoint));
        if (!toAcr) out.add("refresh token in a non-ACR request");
        else if (!tokenOrRevoke) out.add("refresh token outside /token and /revoke");
    }
}

function responseViolations(
    observed: Extract<Observed, { kind: "response" }>,
    acr: AcrEndpoints,
    out: Set<string>,
) {
    if (hasAccess(observed.url)) out.add("access token in a URL");
    if (hasRefresh(observed.url)) out.add("refresh token in a URL");
    for (const [name, value] of Object.entries(observed.headers)) {
        const header = `${name}: ${value}`;
        if (hasAccess(header)) out.add("access token in a response header");
        if (hasRefresh(header)) out.add("refresh token in a response header");
    }
    const tokenResponse = sameEndpoint(observed.url, acr.tokenEndpoint) && observed.status === 200;
    if (!tokenResponse && hasAccess(observed.body)) out.add("access token in a response body");
    if (!tokenResponse && hasRefresh(observed.body)) out.add("refresh token in a response body");
}

/** The named places a token was seen where it must not be; empty when every token is in place. */
export function tokenBoundaryViolations(
    observed: readonly Observed[],
    acr: AcrEndpoints,
): string[] {
    const out = new Set<string>();
    for (const item of observed) {
        switch (item.kind) {
            case "request":
                requestViolations(item, acr, out);
                break;
            case "response":
                responseViolations(item, acr, out);
                break;
            case "console":
                if (hasAccess(item.text)) out.add("access token in the console");
                if (hasRefresh(item.text)) out.add("refresh token in the console");
                break;
            case "storage": {
                // The key is checked as well as the value (r1 on web #1665).
                const entry = `${item.key}\n${item.value}`;
                if (item.area === "local") {
                    if (hasAccess(entry)) out.add("access token in localStorage");
                    if (hasRefresh(entry)) out.add("refresh token in localStorage");
                } else {
                    if (hasAccess(entry)) out.add("access token in sessionStorage");
                    if (hasRefresh(entry) && item.key !== FAMILY_KEY) {
                        out.add("refresh token in sessionStorage outside the family");
                    }
                }
                break;
            }
        }
    }
    return [...out].sort();
}

/** The access tokens in a text, for a scenario that needs the one ACR issued. */
export function accessTokensIn(text: string): string[] {
    return text.match(ACCESS_ALL) ?? [];
}
