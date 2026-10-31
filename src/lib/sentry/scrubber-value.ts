const SENSITIVE_QUERY_PARAMETER_NAMES = [
    "code",
    "state",
    "error",
    "error_description",
    "error_reason",
    "error_uri",
    "client_secret",
    "api_token",
    "access_token",
    "refresh_token",
    "authorization",
    "password",
    "cookie",
    "x-csrf-token",
] as const;
const SENSITIVE_PAYLOAD_FIELD_NAMES = [
    "client_secret",
    "api_token",
    "access_token",
    "refresh_token",
    "authorization",
    "cookie",
    "x-csrf-token",
] as const;
const OAUTH_CONTEXT_KEY_NAMES = ["oauth", "callback", "provider"] as const;
const CALLBACK_PATH_PATTERN = /\/callback\/?$/;
const URL_IN_TEXT_PATTERN = /(?:https?:\/\/|\/)[^\s"'<>]+/g;
const SENSITIVE_QUERY_VALUE_PATTERN =
    /(^|[?&])((?:code|state|error|error[_-]?description|error[_-]?reason|error[_-]?uri|client[_-]?secret|api[_-]?token|access[_-]?token|refresh[_-]?token|authorization|password|cookie|x[_-]?csrf[_-]?token)=)[^&#\s]*/gi;
const SENSITIVE_ASSIGNMENT_PATTERN =
    /\b((?:client[_-]?secret|api[_-]?token|access[_-]?token|refresh[_-]?token|authorization|password|cookie|x[_-]?csrf[_-]?token)\s*[:=]\s*(?:(?:bearer|basic)\s+)?)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s&,;]+)/gi;
const FILTERED = "[Filtered]";

// `scheme://user:pass/word@host`: a password with a raw slash is not valid, but a DSN built by hand has it.
// The part up to the last `@` goes when it starts with `user:` and that colon is not a `host:port/`.
function filterSlashedUserinfo(token: string): string {
    const schemeEnd = token.indexOf("://") + 3;
    const at = token.lastIndexOf("@");
    if (at < schemeEnd) return token;
    const userinfo = token.slice(schemeEnd, at);
    if (!/^[^\s/@:]+:/.test(userinfo) || /^[^\s/@:]+:\d*\//.test(userinfo)) return token;
    return `${token.slice(0, schemeEnd)}${FILTERED}${token.slice(at)}`;
}
// One address shape for every sink. The local part is anchored by a lookbehind and bounded, labels end in a
// literal dot, and the host ends in letters (or a punycode label, or an IP literal), so the rule stays
// linear on a 16 KB scalar. Letters and digits of any script count, and the compatibility forms of the at
// sign and the full stop (full width, small, one dot leader) and HTML character references for both are read
// as the ASCII ones. Invisible format characters (joiners, marks, soft hyphen) are allowed in every part, so
// they cannot split a host. Every at sign followed by a host is filtered, whatever follows the host (a file
// suffix, a number). Three readable exemptions apply only when the text after the at sign matches from its
// FIRST character: exact version text, a retina image name, and a colon plus a path character after the host
// (an scp style remote).
const WORD = "\\p{L}\\p{M}\\p{N}_";
const FORMAT = "\\p{Cf}";
const LOCAL_CLASS = `[${WORD}${FORMAT}.%+-]`;
const AT_SIGN = "(?:[@\\uFF20\\uFE6B]|%40|&#0*64(?!\\d);?|&#x0*40(?![\\da-f]);?|&commat;)";
const DOT =
    "(?:[.\\uFF0E\\u3002\\uFF61\\uFE52\\u2024]|&#0*46(?!\\d);?|&#x0*2e(?![\\da-f]);?|&period;)";
const VERSION_IDENTIFIERS = "[a-z\\d-]{1,62}(?:\\.[a-z\\d-]{1,62}){0,12}";
const VERSION_TEXT = `v?\\d+\\.\\d+\\.\\d+(?:-${VERSION_IDENTIFIERS})?(?:\\+${VERSION_IDENTIFIERS})?`;
const VERSION_FILE_SUFFIX =
    "(?:\\.min)?(?:\\.(?:m?js|cjs|css|(?:js|css)\\.map|map|d\\.ts|tgz|gz))?";
const RETINA_IMAGE = "\\d{1,2}x\\.(?:png|jpe?g|gif|webp|avif|svg)";
const HOST_END = `(?![\\p{L}\\p{N}${FORMAT}_-]|${DOT}[\\p{L}\\p{N}])`;
const OCTET = "(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)";
const LABEL_CHAR = "\\p{L}\\p{M}\\p{N}";
const LABEL = `${FORMAT}*[${LABEL_CHAR}]${FORMAT}*(?:[${LABEL_CHAR}-]${FORMAT}*){0,62}`;
const HOST_NAME =
    `(?:${LABEL}${DOT}){1,12}` +
    `${FORMAT}*(?:xn--[a-z\\d-]{2,59}${FORMAT}*|(?:[\\p{L}\\p{M}]${FORMAT}*){2,24})`;
const HOST_IPV4 = `(?:${OCTET}${DOT}){3}${OCTET}`;
const HOST_IP_LITERAL = "\\[(?:IPv6:)?(?=[\\da-f]*[:.])[\\da-f:.]{2,45}(?:%[\\w.-]{1,16})?\\]";
const EMAIL_SHAPE = new RegExp(
    `(?<!${LOCAL_CLASS})${LOCAL_CLASS}{1,128}${AT_SIGN}` +
        `(?!(?:${VERSION_TEXT}${VERSION_FILE_SUFFIX}|${RETINA_IMAGE})${HOST_END})` +
        `(?:${HOST_NAME}|${FORMAT}*(?:${HOST_IPV4}|${HOST_IP_LITERAL}))` +
        `(?![\\p{L}\\p{N}_-])(?!:[\\w~./-])`,
    "giu",
);
// Credential shapes that carry no field name. Bounded quantifiers and a start anchor keep each rule
// linear on a 16 KB scalar.
const CREDENTIAL_SHAPES: ReadonlyArray<readonly [RegExp, string | ((match: string) => string)]> = [
    [
        /-----BEGIN [A-Z ]{0,24}PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]{0,24}PRIVATE KEY-----|$)/g,
        FILTERED,
    ],
    [/\bbearer\s+[\w.~+/=-]{8,}/gi, `Bearer ${FILTERED}`],
    [/\beyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]*/g, FILTERED],
    [
        /\b(?:gh[pousr]_|github_pat_|sk-|rk_live_|sk_live_|xox[abprs]-|svc_worker_)[\w-]{8,}/g,
        FILTERED,
    ],
    // CHAOS-12304: ACR's browser access (`fcacr_`) and refresh (`acrrt_`) tokens, wherever they appear:
    // no word boundary, so `prefix_fcacr_…` or `abcacrrt_…` is filtered too (r2 on web #1665).
    [/(?:fcacr|acrrt)_[\w-]{8,}/g, FILTERED],
    [/\b([a-z][a-z\d+.-]{0,31}:\/\/)[^\s/@]+@/gi, `$1${FILTERED}@`],
    [/\b[a-z][a-z\d+.-]{0,31}:\/\/\S+/gi, filterSlashedUserinfo],
    // A password that holds a space. Prose such as `host:8080 word me@x` is removed too: fail safe.
    [/\b([a-z][a-z\d+.-]{0,31}:\/\/)[^\s/@:]{0,128}:[^/@\r\n]{1,256}@/gi, `$1${FILTERED}@`],
    // `user:pass@host` with no scheme.
    [
        /(?<![\w@:/.~%+-])[\w.~%+-]{1,64}:[^\s/@:]{1,256}@[a-z\d][\w.-]{0,253}/gi,
        (match) => (/^mailto:/i.test(match) ? match : FILTERED),
    ],
    [/\b((?:__Secure-|__Host-)?(?:authjs|next-auth)\.[\w.-]{0,64}=)[^;\s]+/gi, `$1${FILTERED}`],
    // Last, so the userinfo rules above keep their own shapes.
    [EMAIL_SHAPE, FILTERED],
];
// A token that holds a percent escape is decoded before the address rule runs on it, so an address that
// is written with %40 and %2E (or twice encoded) does not slip past. A token that cannot be decoded
// is dropped whole.
const TOKEN_CLASS = `[${WORD}.%+@\\uFF20-]`;
const ENCODED_TOKEN = new RegExp(
    `(?<!${TOKEN_CLASS})${TOKEN_CLASS}{0,1536}%[\\da-f]{2}${TOKEN_CLASS}{0,1536}`,
    "giu",
);
const MAX_DEPTH = 32;
const MAX_NODES = 4_096;
const MAX_CONTAINER_ITEMS = 1_000;
const MAX_SCALAR_LENGTH = 16_384;
const MAX_TOTAL_CHARACTERS = 262_144;
const MAX_URL_NESTING = 4;
const MAX_PERCENT_DECODE_ROUNDS = 3;

type TraversalState = {
    readonly active: WeakSet<object>;
    nodes: number;
    characters: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFieldName(value: string): string {
    return value
        .normalize("NFKC")
        .replace(/[^a-z\d]/gi, "")
        .toLowerCase();
}

function matchesNormalizedName(value: string, names: readonly string[]): boolean {
    const normalized = normalizeFieldName(value);
    return names.some((name) => normalizeFieldName(name) === normalized);
}

export function isSensitiveQueryParameterName(value: string): boolean {
    return matchesNormalizedName(value, SENSITIVE_QUERY_PARAMETER_NAMES);
}

function isSensitivePayloadFieldName(value: string): boolean {
    return matchesNormalizedName(value, SENSITIVE_PAYLOAD_FIELD_NAMES);
}

function isOAuthContextKey(value: string): boolean {
    return matchesNormalizedName(value, OAUTH_CONTEXT_KEY_NAMES);
}

function isOAuthContextRecord(value: Record<string, unknown>): boolean {
    const fieldNames = Object.keys(value).map(normalizeFieldName);
    return (
        (fieldNames.includes("code") && fieldNames.includes("state")) ||
        fieldNames.some(isSensitivePayloadFieldName) ||
        (typeof value.url === "string" && CALLBACK_PATH_PATTERN.test(value.url))
    );
}

function isAbsoluteUrl(value: string): boolean {
    return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function decodePercent(value: string): string {
    let decoded = value;
    for (let round = 0; round < MAX_PERCENT_DECODE_ROUNDS; round += 1) {
        try {
            const candidate = decodeURIComponent(decoded);
            if (candidate === decoded) return decoded;
            decoded = candidate;
        } catch {
            return FILTERED;
        }
    }
    return /%[\da-f]{2}/iu.test(decoded) ? FILTERED : decoded;
}

// Decodes round by round. A malformed escape in the token does not stop it: the valid ASCII escapes are
// still decoded. A token that still changes after the last round is hostile nesting: null.
const MAX_ESCAPE_ROUNDS = 8;
const ESCAPE_RUN = /(?:%[\da-f]{2}){1,512}/gi;
// Every run of valid escapes is decoded on its own, multi-byte text included. A run that is not valid
// UTF-8 keeps its ASCII escapes decoded and the rest literal; a stray percent sign stays as it is.
function decodeEscapeRun(run: string): string {
    try {
        return decodeURIComponent(run);
    } catch {
        return run.replace(/%([0-7][\da-f])/gi, (_match, hex: string) =>
            String.fromCharCode(Number.parseInt(hex, 16)),
        );
    }
}

function decodeEscapes(token: string): string | null {
    let decoded = token;
    for (let round = 0; round < MAX_ESCAPE_ROUNDS; round += 1) {
        const next = decoded.replace(ESCAPE_RUN, decodeEscapeRun);
        if (next === decoded) return decoded;
        decoded = next;
    }
    return null;
}

function scrubEncodedAddresses(value: string): string {
    return value.replace(ENCODED_TOKEN, (token) => {
        const decoded = decodeEscapes(token);
        return decoded === null || decoded.replace(EMAIL_SHAPE, FILTERED) !== decoded
            ? FILTERED
            : token;
    });
}

function scrubCredentialShapes(value: string): string {
    let shaped = value;
    for (const [pattern, replacement] of CREDENTIAL_SHAPES) {
        shaped =
            typeof replacement === "string"
                ? shaped.replace(pattern, replacement)
                : shaped.replace(pattern, replacement);
    }
    return scrubEncodedAddresses(shaped);
}

export function scrubTelemetryUrl(input: string, nesting = 0): string {
    if (nesting >= MAX_URL_NESTING || input.length > MAX_SCALAR_LENGTH) return FILTERED;
    // A character reference holds a number sign, so the URL parser would cut the address into path and hash.
    const value = scrubCredentialShapes(input);
    try {
        const url = new URL(value, "https://sentry.invalid");
        if (CALLBACK_PATH_PATTERN.test(url.pathname)) {
            url.search = "";
        } else {
            for (const [name, parameterValue] of [...url.searchParams.entries()]) {
                if (isSensitiveQueryParameterName(name)) {
                    url.searchParams.set(name, FILTERED);
                    continue;
                }
                const decoded = decodePercent(parameterValue);
                url.searchParams.set(
                    name,
                    decoded === FILTERED ? FILTERED : scrubTelemetryText(decoded, nesting + 1),
                );
            }
        }
        url.username = "";
        url.password = "";
        url.hash = "";
        const scrubbed = isAbsoluteUrl(value) ? url.toString() : `${url.pathname}${url.search}`;
        return scrubEncodedAddresses(scrubbed.replace(EMAIL_SHAPE, FILTERED));
    } catch {
        return scrubCredentialShapes(value).replace(
            SENSITIVE_QUERY_VALUE_PATTERN,
            `$1$2${FILTERED}`,
        );
    }
}

export function scrubTelemetryText(value: string, nesting = 0): string {
    if (value.length > MAX_SCALAR_LENGTH) return FILTERED;
    return scrubCredentialShapes(value)
        .replace(URL_IN_TEXT_PATTERN, (url) => scrubTelemetryUrl(url, nesting))
        .replace(SENSITIVE_QUERY_VALUE_PATTERN, `$1$2${FILTERED}`)
        .replace(SENSITIVE_ASSIGNMENT_PATTERN, `$1${FILTERED}`);
}

function scrubTelemetryValue(
    value: unknown,
    traversal: TraversalState,
    depth = 0,
    inheritedOAuthContext = false,
): unknown {
    if (typeof value === "string") {
        if (
            value.length > MAX_SCALAR_LENGTH ||
            traversal.characters + value.length > MAX_TOTAL_CHARACTERS
        )
            return FILTERED;
        traversal.characters += value.length;
        return scrubTelemetryText(value);
    }
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return FILTERED;
    if (Array.isArray(value)) return scrubArray(value, traversal, depth, inheritedOAuthContext);
    if (!isRecord(value)) return value;
    return scrubRecord(value, traversal, depth, inheritedOAuthContext);
}

function enterContainer(
    value: object,
    itemCount: number,
    traversal: TraversalState,
    depth: number,
): boolean {
    if (
        depth >= MAX_DEPTH ||
        itemCount > MAX_CONTAINER_ITEMS ||
        traversal.nodes + itemCount > MAX_NODES ||
        traversal.active.has(value)
    )
        return false;
    traversal.nodes += itemCount;
    traversal.active.add(value);
    return true;
}

function scrubArray(
    value: unknown[],
    traversal: TraversalState,
    depth: number,
    inheritedOAuthContext: boolean,
): unknown {
    if (!enterContainer(value, value.length, traversal, depth)) return FILTERED;
    try {
        return value.map((item) =>
            scrubTelemetryValue(item, traversal, depth + 1, inheritedOAuthContext),
        );
    } finally {
        traversal.active.delete(value);
    }
}

function scrubRecord(
    value: Record<string, unknown>,
    traversal: TraversalState,
    depth: number,
    inheritedOAuthContext: boolean,
): unknown {
    let entries: [string, unknown][];
    try {
        entries = Object.entries(value);
    } catch {
        return FILTERED;
    }
    if (!enterContainer(value, entries.length, traversal, depth)) return FILTERED;
    try {
        const oauthContext = inheritedOAuthContext || isOAuthContextRecord(value);
        // A property name is a channel too (r1 on web #1665): a credential shape in it is filtered,
        // and names that collapse to the same marker stay distinct.
        // Every name the record already has is taken, so a renamed key never overwrites one (r2).
        const names = new Set<string>(entries.map(([key]) => key));
        const safeName = (key: string): string => {
            const scrubbed = scrubCredentialShapes(key);
            if (scrubbed === key) return key;
            let name = FILTERED;
            for (let index = 2; names.has(name); index += 1) name = `${FILTERED}#${index}`;
            names.add(name);
            return name;
        };
        return Object.fromEntries(
            entries.map(([key, nestedValue]) => [
                safeName(key),
                isSensitivePayloadFieldName(key) ||
                (oauthContext && isSensitiveQueryParameterName(key))
                    ? FILTERED
                    : scrubTelemetryValue(
                          nestedValue,
                          traversal,
                          depth + 1,
                          oauthContext || isOAuthContextKey(key),
                      ),
            ]),
        );
    } finally {
        traversal.active.delete(value);
    }
}

export function scrubTelemetryPayload<Payload extends object>(payload: Payload): Payload {
    const scrubbed = scrubTelemetryValue(payload, {
        active: new WeakSet<object>(),
        nodes: 0,
        characters: 0,
    });
    if (!isRecord(scrubbed)) return payload;
    // The original is merged under the scrubbed copy; a property name with a credential shape was
    // renamed there, so it must not come back from the original (r1 on web #1665).
    const kept = Object.fromEntries(
        Object.entries(payload).filter(([key]) => scrubCredentialShapes(key) === key),
    );
    return { ...kept, ...scrubbed } as Payload;
}
