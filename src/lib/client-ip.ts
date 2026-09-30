import { createHash } from "node:crypto";
import { isIP } from "node:net";

type HeaderReadable = {
    headers: Pick<Headers, "get">;
};

export type ClientIpOptions = {
    trustProxy?: boolean;
    /**
     * How many trusted proxies sit in front of the app (default 1). The client is
     * the Nth entry from the RIGHT of X-Forwarded-For. Web code cannot see the TCP
     * peer (Next.js only fills X-Forwarded-For from the socket when the header is
     * absent), so the trusted-proxy count replaces the Go api's peer/CIDR test.
     */
    trustedProxyHops?: number;
};

export const DEFAULT_TRUSTED_PROXY_HOPS = 1;
const MAX_TRUSTED_PROXY_HOPS = 32;

/**
 * Parses TRUSTED_PROXY_HOPS. Anything that is not an integer in 1..32 gives the
 * default (1), never 0 and never "no limit": a bad value must not select the
 * client-writable left end of the chain.
 */
export function parseTrustedProxyHops(value: string | undefined): number {
    const text = value?.trim();
    if (!text || !/^\d+$/.test(text)) return DEFAULT_TRUSTED_PROXY_HOPS;
    const hops = Number(text);
    return hops >= 1 && hops <= MAX_TRUSTED_PROXY_HOPS ? hops : DEFAULT_TRUSTED_PROXY_HOPS;
}

/**
 * Reads one address as a proxy header carries it: bare IP, IP:port, [IPv6] or
 * [IPv6]:port. Zone dropped, IPv6 compressed and lower-cased, IPv4-mapped IPv6
 * unmapped, so one client cannot split across several bucket keys. Anything else
 * (empty, hostnames, garbage) is null and never becomes a client address.
 */
export function parseIpEntry(raw: string | null | undefined): string | null {
    let text = raw?.trim() ?? "";
    if (!text) return null;
    if (text.startsWith("[")) {
        const close = text.indexOf("]");
        if (close < 0) return null;
        const rest = text.slice(close + 1);
        if (rest !== "" && !/^:\d+$/.test(rest)) return null;
        text = text.slice(1, close);
    } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(text)) {
        text = text.slice(0, text.lastIndexOf(":"));
    }
    const zone = text.indexOf("%");
    if (zone >= 0) text = text.slice(0, zone);
    const family = isIP(text);
    if (family === 4) return text;
    if (family !== 6) return null;
    let canonical: string;
    try {
        canonical = new URL(`http://[${text}]`).hostname.slice(1, -1);
    } catch {
        return null;
    }
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
    if (mapped) {
        const high = parseInt(mapped[1], 16);
        const low = parseInt(mapped[2], 16);
        return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    }
    return canonical;
}

/**
 * Best-effort key when no trusted client address exists. It hashes only headers a
 * browser keeps stable between requests; x-vercel-id and cf-ray are NOT included
 * (they differ on every request, so they gave every request its own key, and a
 * client can write them). Every input is still client-written, so this key can be
 * split by changing user-agent: it is a shared-bucket approximation, not identity.
 * A deployment that needs hard per-client limits must run with TRUST_PROXY on
 * behind a proxy that owns X-Forwarded-For.
 */
function anonymousFingerprint(request: HeaderReadable): string {
    const fallbackIdentifier = [
        request.headers.get("user-agent") ?? "",
        request.headers.get("accept-language") ?? "",
        request.headers.get("sec-ch-ua") ?? "",
    ].join("|");

    if (!fallbackIdentifier.replaceAll("|", "")) {
        return "unknown";
    }

    return `anon:${createHash("sha256").update(fallbackIdentifier).digest("hex")}`;
}

export function isTrustProxyEnabled(value: string | undefined): boolean {
    return value === "true" || value === "1";
}

/**
 * Client address for rate-limit keys (CHAOS-7205). Same contract as the Go api's
 * clientip package, with a trusted-proxy COUNT in place of the peer test:
 *
 *  - trustProxy off: X-Forwarded-For, X-Real-IP and the platform headers are all
 *    ignored (any of them is client-writable when no proxy in front owns it);
 *    the key is an anonymous fingerprint.
 *  - trustProxy on: X-Forwarded-For (all lines joined) is read from the RIGHT and
 *    the trustedProxyHops-th entry is the client. Entries to its left are
 *    client-supplied and are never read. A chain shorter than the hop count, or a
 *    malformed entry at that position, never falls back to the leftmost entry: a
 *    short chain moves on to X-Real-IP, a malformed entry goes to the fingerprint.
 *  - X-Real-IP, then x-vercel-forwarded-for, then cf-connecting-ip are consulted
 *    only with trustProxy on and only when the chain gave nothing.
 */
export function getClientIp(request: HeaderReadable, options: ClientIpOptions = {}): string {
    if (options.trustProxy) {
        const hops = options.trustedProxyHops ?? DEFAULT_TRUSTED_PROXY_HOPS;
        const forwarded = request.headers.get("x-forwarded-for") ?? "";
        const chain = forwarded.split(",");
        const index = chain.length - Math.max(1, Math.trunc(hops));
        // A header with any content (even "," alone) is a chain: its empty selected
        // entry is malformed and must not fall through to x-real-ip.
        if (forwarded.trim() !== "" && index >= 0) {
            const hop = parseIpEntry(chain[index]);
            return hop ?? anonymousFingerprint(request);
        }

        for (const name of ["x-real-ip", "x-vercel-forwarded-for", "cf-connecting-ip"]) {
            const value = parseIpEntry(request.headers.get(name)?.split(",")[0]);
            if (value) return value;
        }
    }

    return anonymousFingerprint(request);
}

type ClientIpEnv = {
    TRUST_PROXY?: string | undefined;
    TRUSTED_PROXY_HOPS?: string | undefined;
    [key: string]: unknown;
};

/**
 * getClientIp driven by the process environment (TRUST_PROXY, TRUSTED_PROXY_HOPS).
 * Every caller uses this, so none can pass a trust flag without the hop count.
 */
export function getClientIpFromEnv(
    request: HeaderReadable,
    env: ClientIpEnv = process.env,
): string {
    return getClientIp(request, {
        trustProxy: isTrustProxyEnabled(env.TRUST_PROXY),
        trustedProxyHops: parseTrustedProxyHops(env.TRUSTED_PROXY_HOPS),
    });
}
