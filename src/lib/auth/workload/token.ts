import "server-only";
import { readFile } from "node:fs/promises";
import { getServerEnv } from "@/lib/config";
import { logger } from "@/lib/logger";

// Server-only workload token source: exchanges the projected ServiceAccount token at auth-service
// for a short-lived workload token (RFC 8693). Rules mirror dev-health-go workloadtoken v0.44.0.
// No consumer yet. The token and the subject are never logged and never put in an error.

const PATH = "/internal/v1/token/exchange";
const AUDIENCE = "auth-service";
const JWT_TYPE = "urn:ietf:params:oauth:token-type:jwt";
const MAX_LIFETIME_S = 300;
const REFRESH_FRACTION = 0.5;
const SAFETY_MARGIN_MS = 30_000;
const TIMEOUT_MS = 5_000;
const MAX_ANSWER_BYTES = 16_384;
const ISSUER_SHAPE = /^https:\/\/[^\s/?#]+(\/[^\s?#]*)?$/;
const JWS_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export class WorkloadTokenError extends Error {
    constructor(reason: string) {
        super(`workload token unavailable (${reason})`);
        this.name = "WorkloadTokenError";
    }
}

interface Entry {
    token: string;
    refreshAt: number;
    usableUntil: number;
}

let entry: Entry | null = null;
let flight: Promise<Entry> | null = null;

interface Source {
    url: string;
    subjectFile: string;
    issuer: string;
}

function source(): Source | undefined {
    const env = getServerEnv();
    const base = env.AUTH_INTERNAL_URL?.trim();
    const subjectFile = env.AUTH_WORKLOAD_SUBJECT_FILE?.trim();
    const issuer = env.AUTH_WORKLOAD_ISSUER?.trim();
    if (!base || !subjectFile || !issuer || !ISSUER_SHAPE.test(issuer)) return undefined;
    return { url: base.replace(/\/+$/, "") + PATH, subjectFile, issuer };
}

// Top-level member names of a JSON object text, in order. Duplicates are visible here, which
// JSON.parse hides.
function topLevelNames(text: string): string[] | null {
    const names: string[] = [];
    let depth = 0;
    let i = 0;
    let expectKey = false;
    while (i < text.length) {
        const c = text[i];
        if (c === '"') {
            let j = i + 1;
            while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
            if (j >= text.length) return null;
            if (depth === 1 && expectKey) {
                try {
                    names.push(JSON.parse(text.slice(i, j + 1)) as string);
                } catch {
                    return null;
                }
                expectKey = false;
            }
            i = j + 1;
            continue;
        }
        if (c === "{" || c === "[") {
            depth++;
            if (depth === 1 && c === "{") expectKey = true;
        } else if (c === "}" || c === "]") depth--;
        else if (c === "," && depth === 1) expectKey = true;
        i++;
    }
    return names;
}

// Advisory only: auth-service verifies the signature and is the trust check. These claim checks
// catch a mis-wired exchange; they do not authenticate the token.
function claimsOk(token: string, issuer: string): boolean {
    if (!JWS_SHAPE.test(token)) return false;
    let text: string;
    try {
        text = Buffer.from(token.split(".")[1], "base64url").toString("utf8");
    } catch {
        return false;
    }
    const names = topLevelNames(text);
    if (!names || new Set(names).size !== names.length) return false;
    let claims: unknown;
    try {
        claims = JSON.parse(text);
    } catch {
        return false;
    }
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return false;
    const c = claims as Record<string, unknown>;
    return c.iss === issuer && c.aud === AUDIENCE && c.principal_type === "workload";
}

async function exchange(src: Source): Promise<Entry> {
    let subject: string;
    try {
        subject = (await readFile(src.subjectFile, "utf8")).trim();
    } catch {
        throw new WorkloadTokenError("subject file unreadable");
    }
    if (!JWS_SHAPE.test(subject)) throw new WorkloadTokenError("subject file is not a token");
    const form = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token: subject,
        subject_token_type: JWT_TYPE,
        audience: AUDIENCE,
    });
    const sent = Date.now();
    let res: Response;
    try {
        res = await fetch(src.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: form.toString(),
            redirect: "error",
            cache: "no-store",
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch {
        throw new WorkloadTokenError("transport");
    }
    if (res.status !== 200) throw new WorkloadTokenError(`status ${res.status}`);
    if (!(res.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json"))
        throw new WorkloadTokenError("answer is not JSON");
    let text: string;
    try {
        text = await res.text();
    } catch {
        throw new WorkloadTokenError("read");
    }
    if (text.length > MAX_ANSWER_BYTES) throw new WorkloadTokenError("answer too large");
    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        throw new WorkloadTokenError("malformed answer");
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
        throw new WorkloadTokenError("malformed answer");
    const a = body as Record<string, unknown>;
    if (typeof a.token_type !== "string" || a.token_type.toLowerCase() !== "bearer")
        throw new WorkloadTokenError("token_type is not Bearer");
    if (a.issued_token_type !== JWT_TYPE) throw new WorkloadTokenError("issued_token_type");
    const seconds = a.expires_in;
    if (
        typeof seconds !== "number" ||
        !Number.isInteger(seconds) ||
        seconds < 1 ||
        seconds > MAX_LIFETIME_S
    )
        throw new WorkloadTokenError("expires_in is not an integer in 1..300");
    const token = a.access_token;
    if (typeof token !== "string" || !claimsOk(token, src.issuer))
        throw new WorkloadTokenError("token claims break the workload-token contract");
    const lifetime = seconds * 1000;
    const usableUntil = sent + lifetime - SAFETY_MARGIN_MS;
    if (usableUntil <= Date.now()) throw new WorkloadTokenError("token outside its usable window");
    const refreshAt = Math.min(sent + lifetime * REFRESH_FRACTION, usableUntil);
    return { token, refreshAt, usableUntil };
}

/**
 * Returns a workload token for audience `auth-service`, or `undefined` when the token source is
 * not configured (no request is made). Throws `WorkloadTokenError` when no usable token can be
 * had: the caller must not send its request, and must not fall back to another credential.
 */
export async function getWorkloadToken(): Promise<string | undefined> {
    const src = source();
    if (!src) return undefined;
    const now = Date.now();
    if (entry && now >= entry.usableUntil) entry = null;
    if (entry && now < entry.refreshAt) return entry.token;
    if (!flight) {
        const started = exchange(src).then(
            (fresh) => {
                entry = fresh;
                return fresh;
            },
            (err: unknown) => {
                logger.warn(
                    { reason: err instanceof WorkloadTokenError ? err.message : "exchange failed" },
                    "workload token exchange failed",
                );
                throw err;
            },
        );
        flight = started;
        const clear = () => {
            if (flight === started) flight = null;
        };
        started.then(clear, clear);
    }
    try {
        return (await flight).token;
    } catch (err) {
        if (entry && Date.now() < entry.usableUntil) return entry.token;
        throw err instanceof WorkloadTokenError ? err : new WorkloadTokenError("exchange failed");
    }
}
