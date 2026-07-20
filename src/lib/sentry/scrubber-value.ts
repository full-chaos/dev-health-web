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
    /\b((?:client[_-]?secret|api[_-]?token|access[_-]?token|refresh[_-]?token|authorization|password|cookie|x[_-]?csrf[_-]?token)\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s&,;]+)/gi;
const FILTERED = "[Filtered]";
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

export function scrubTelemetryUrl(value: string, nesting = 0): string {
    if (nesting >= MAX_URL_NESTING || value.length > MAX_SCALAR_LENGTH) return FILTERED;
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
        url.hash = "";
        return isAbsoluteUrl(value) ? url.toString() : `${url.pathname}${url.search}`;
    } catch {
        return value.replace(SENSITIVE_QUERY_VALUE_PATTERN, `$1$2${FILTERED}`);
    }
}

export function scrubTelemetryText(value: string, nesting = 0): string {
    if (value.length > MAX_SCALAR_LENGTH) return FILTERED;
    return value
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
        return Object.fromEntries(
            entries.map(([key, nestedValue]) => [
                key,
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
    return isRecord(scrubbed) ? { ...payload, ...scrubbed } : payload;
}
