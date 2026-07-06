/**
 * Pure IP/CIDR parsing, validation, and containment logic for the IP
 * allowlist admin surface (CHAOS-2842). No React, no server dependencies —
 * safe to unit test in isolation and to share between the client form and
 * the client-side lockout-prevention warning.
 */

export type CidrParseResult =
    | { valid: true; ip: string; version: 4 | 6; prefixLength: number }
    | { valid: false; error: string };

const IPV4_OCTET = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4_REGEX = new RegExp(`^${IPV4_OCTET}(\\.${IPV4_OCTET}){3}$`);

// Canonical IPv6 pattern covering full, compressed ("::"), and mixed forms.
const V6_SEG = "[0-9a-fA-F]{1,4}";
const IPV6_REGEX = new RegExp(
    "^(" +
        `(${V6_SEG}:){7}${V6_SEG}` +
        `|(${V6_SEG}:){1,7}:` +
        `|(${V6_SEG}:){1,6}:${V6_SEG}` +
        `|(${V6_SEG}:){1,5}(:${V6_SEG}){1,2}` +
        `|(${V6_SEG}:){1,4}(:${V6_SEG}){1,3}` +
        `|(${V6_SEG}:){1,3}(:${V6_SEG}){1,4}` +
        `|(${V6_SEG}:){1,2}(:${V6_SEG}){1,5}` +
        `|${V6_SEG}:((:${V6_SEG}){1,6})` +
        `|:((:${V6_SEG}){1,7}|:)` +
        ")$",
);

function isValidIpv4(address: string): boolean {
    return IPV4_REGEX.test(address);
}

/**
 * Expands an IPv4-mapped/compatible IPv6 tail (e.g. "::ffff:192.0.2.1" ->
 * "::ffff:c000:201") into pure hextets so the rest of the parser and the
 * containment math can treat every IPv6 address as 8 hex groups — matching
 * what the backend's Python `ipaddress` module accepts. Returns the address
 * unchanged when it has no dotted-quad tail, or `null` when a "." is
 * present but the tail isn't a valid IPv4 address.
 */
function expandEmbeddedIpv4Tail(address: string): string | null {
    if (!address.includes(".")) return address;

    const lastColon = address.lastIndexOf(":");
    if (lastColon === -1) return null;

    const tail = address.slice(lastColon + 1);
    if (!isValidIpv4(tail)) return null;

    const octets = tail.split(".").map(Number);
    const hexHigh = ((octets[0] << 8) | octets[1]).toString(16);
    const hexLow = ((octets[2] << 8) | octets[3]).toString(16);
    return `${address.slice(0, lastColon)}:${hexHigh}:${hexLow}`;
}

/** Parses a bare IP address or a `<ip>/<prefix>` CIDR range. */
export function parseIpOrCidr(value: string): CidrParseResult {
    const segments = value.split("/");
    if (segments.length > 2) {
        return {
            valid: false,
            error: 'Use a single "/" to separate the address and prefix length.',
        };
    }

    const [address, prefixPart] = segments;
    if (!address) {
        return { valid: false, error: "Enter an IP address or CIDR range." };
    }

    let normalizedIp: string;
    let version: 4 | 6;
    if (isValidIpv4(address)) {
        normalizedIp = address;
        version = 4;
    } else {
        const expanded = expandEmbeddedIpv4Tail(address);
        if (expanded === null || !IPV6_REGEX.test(expanded)) {
            return { valid: false, error: `"${address}" is not a valid IPv4 or IPv6 address.` };
        }
        normalizedIp = expanded;
        version = 6;
    }

    const maxPrefix = version === 4 ? 32 : 128;
    if (prefixPart === undefined) {
        return { valid: true, ip: normalizedIp, version, prefixLength: maxPrefix };
    }

    if (!/^\d{1,3}$/.test(prefixPart)) {
        return {
            valid: false,
            error: `Prefix length must be a number between 0 and ${maxPrefix}.`,
        };
    }

    const prefixLength = Number(prefixPart);
    if (prefixLength < 0 || prefixLength > maxPrefix) {
        return {
            valid: false,
            error: `Prefix length must be between 0 and ${maxPrefix} for IPv${version}.`,
        };
    }

    return { valid: true, ip: normalizedIp, version, prefixLength };
}

/** Returns a user-safe error message, or `null` when the input is a valid IP/CIDR. */
export function validateIpOrCidrInput(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return "Enter an IP address or CIDR range.";
    }
    const result = parseIpOrCidr(trimmed);
    return result.valid ? null : result.error;
}

function ipv4ToInt(ip: string): number {
    return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isIpv4InCidr(ip: string, network: string, prefixLength: number): boolean {
    if (prefixLength === 0) return true;
    const mask = prefixLength === 32 ? 0xffffffff : (~0 << (32 - prefixLength)) >>> 0;
    return (ipv4ToInt(ip) & mask) === (ipv4ToInt(network) & mask);
}

function expandIpv6Groups(ip: string): string[] {
    const [head, tail] = ip.includes("::") ? ip.split("::") : [ip, undefined];
    const headParts = head ? head.split(":") : [];
    const tailParts = tail ? tail.split(":") : [];
    const missing = 8 - headParts.length - tailParts.length;
    const middle: string[] = missing > 0 ? new Array(missing).fill("0") : [];
    return [...headParts, ...middle, ...tailParts].map((part) => part || "0");
}

function ipv6ToBigInt(ip: string): bigint {
    return expandIpv6Groups(ip).reduce(
        (acc, group) => acc * BigInt(65536) + BigInt(parseInt(group, 16)),
        BigInt(0),
    );
}

function isIpv6InCidr(ip: string, network: string, prefixLength: number): boolean {
    const fullMask = BigInt(2) ** BigInt(128) - BigInt(1);
    const mask =
        prefixLength === 0 ? BigInt(0) : (~BigInt(0) << BigInt(128 - prefixLength)) & fullMask;
    return (ipv6ToBigInt(ip) & mask) === (ipv6ToBigInt(network) & mask);
}

/**
 * Whether `currentIp` falls inside the range described by `ipRangeInput`.
 * Returns `false` when the range does not cover `currentIp` — including
 * when the two are different (but individually valid) IP versions, since
 * an IPv6 current IP is definitively NOT covered by an IPv4-only rule and
 * vice versa, and callers rely on `false` to trigger the lockout warning.
 * Returns `null` only when the comparison is genuinely undeterminable:
 * `currentIp` is unknown, or either value fails to parse as a valid IP/CIDR.
 */
export function currentIpCoveredByRule(
    currentIp: string | null,
    ipRangeInput: string,
): boolean | null {
    if (!currentIp) return null;

    const range = parseIpOrCidr(ipRangeInput.trim());
    const current = parseIpOrCidr(currentIp.trim());
    if (!range.valid || !current.valid) return null;
    if (range.version !== current.version) return false;

    return range.version === 4
        ? isIpv4InCidr(current.ip, range.ip, range.prefixLength)
        : isIpv6InCidr(current.ip, range.ip, range.prefixLength);
}
