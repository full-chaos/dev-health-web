import { createHash } from "node:crypto";

type HeaderReadable = {
    headers: Pick<Headers, "get">;
};

export type ClientIpOptions = {
    trustProxy?: boolean;
};

function firstHeaderValue(value: string | null): string | null {
    const first = value?.split(",")[0]?.trim();
    return first || null;
}

function anonymousFingerprint(request: HeaderReadable): string {
    const fallbackIdentifier = [
        request.headers.get("user-agent") ?? "",
        request.headers.get("accept-language") ?? "",
        request.headers.get("sec-ch-ua") ?? "",
        request.headers.get("x-vercel-id") ?? "",
        request.headers.get("cf-ray") ?? "",
    ].join("|");

    if (!fallbackIdentifier.replaceAll("|", "")) {
        return "unknown";
    }

    return `anon:${createHash("sha256").update(fallbackIdentifier).digest("hex")}`;
}

export function isTrustProxyEnabled(value: string | undefined): boolean {
    return value === "true" || value === "1";
}

export function getClientIp(request: HeaderReadable, options: ClientIpOptions = {}): string {
    if (options.trustProxy) {
        const forwardedFor = firstHeaderValue(request.headers.get("x-forwarded-for"));
        if (forwardedFor) return forwardedFor;

        const realIp = firstHeaderValue(request.headers.get("x-real-ip"));
        if (realIp) return realIp;
    }

    const vercelForwarded = firstHeaderValue(request.headers.get("x-vercel-forwarded-for"));
    if (vercelForwarded) return vercelForwarded;

    const cfConnectingIp = firstHeaderValue(request.headers.get("cf-connecting-ip"));
    if (cfConnectingIp) return cfConnectingIp;

    return anonymousFingerprint(request);
}
