import "server-only";
import { parseDiscovery } from "@/lib/auth/accesstoken/discovery";
import { loadKeySet } from "@/lib/auth/accesstoken/keyset";
import type { Jwk } from "@/lib/auth/accesstoken/verify";
import { logSessionBranch, thrownErrorName } from "@/lib/authSessionLog";
import { deadlineFetch } from "@/lib/serverDeadline";

// The access-token key set of class eddsa. The issuer is pinned by server config
// (AUTH_ACCESS_TOKEN_ISSUER). A refresh reads discovery at the issuer, requires its issuer and
// jwks_uri to match, then reads that key set; a redirect at either step is a failure.
//   - the keys are fresh for 300 s;
//   - a refresh is tried at most once per 30 s, for any reason;
//   - when a refresh fails, the last good keys are used until 600 s past the 300 s;
//   - a kid that is not in the keys gets ONE refresh (the floor still applies); a kid still
//     unknown is refused, and that refusal is final.

const TTL_SECONDS = 300;
const REFRESH_FLOOR_SECONDS = 30;
const OUTAGE_GRACE_SECONDS = 600;

export type KeyAnswer =
    { ok: true; keys: Jwk[] } | { ok: false; reason: "unavailable" | "unknown_kid" };

let store: { keys: Jwk[]; fetchedAt: number } | null = null;
let lastAttemptAt: number | null = null;
let inFlight: Promise<void> | null = null;

export function resetKeySourceForTests(): void {
    store = null;
    lastAttemptAt = null;
    inFlight = null;
}

interface Failure {
    status?: number;
    errorName?: string;
}

async function read(url: string): Promise<{ text: string } | Failure> {
    const res = await deadlineFetch("auth")(url, { method: "GET", redirect: "manual" });
    if (res.status !== 200) return { status: res.status };
    return { text: await res.text() };
}

async function refreshKeys(issuer: string, now: number): Promise<void> {
    let failure: Failure = {};
    try {
        const discovery = await read(`${issuer}/.well-known/openid-configuration`);
        if ("text" in discovery) {
            const parsed = parseDiscovery(discovery.text, issuer);
            if (parsed.ok) {
                const keySet = await read(parsed.jwksUri);
                if ("text" in keySet) {
                    const loaded = loadKeySet(keySet.text);
                    if (loaded.ok) {
                        store = { keys: loaded.keys, fetchedAt: now };
                        return;
                    }
                } else {
                    failure = keySet;
                }
            }
        } else {
            failure = discovery;
        }
    } catch (error) {
        failure = { errorName: thrownErrorName(error) };
    }
    logSessionBranch({
        operation: "login",
        branch: "key_set_unusable",
        ...(failure.status === undefined ? {} : { status: failure.status }),
        ...(failure.errorName === undefined ? {} : { errorName: failure.errorName }),
    });
}

async function attempt(issuer: string, now: number): Promise<void> {
    lastAttemptAt = now;
    inFlight ??= refreshKeys(issuer, now).finally(() => {
        inFlight = null;
    });
    await inFlight;
}

const canAttempt = (now: number): boolean =>
    inFlight !== null || lastAttemptAt === null || now - lastAttemptAt >= REFRESH_FLOOR_SECONDS;

function usableKeys(now: number): Jwk[] | null {
    if (store === null || now - store.fetchedAt > TTL_SECONDS + OUTAGE_GRACE_SECONDS) return null;
    return store.keys;
}

export async function publishedKeysFor(
    issuer: string,
    kid: string | undefined,
    nowSeconds: () => number,
): Promise<KeyAnswer> {
    const now = nowSeconds();
    if ((store === null || now - store.fetchedAt > TTL_SECONDS) && canAttempt(now)) {
        await attempt(issuer, now);
    }
    // The refresh above can take time: the grace cutoff is judged at the time it ended.
    let keys = usableKeys(nowSeconds());
    if (keys === null) return { ok: false, reason: "unavailable" };
    if (kid !== undefined && !keys.some((key) => key.kid === kid)) {
        if (canAttempt(now)) {
            await attempt(issuer, now);
            keys = usableKeys(nowSeconds()) ?? keys;
        }
        if (!keys.some((key) => key.kid === kid)) return { ok: false, reason: "unknown_kid" };
    }
    return { ok: true, keys };
}
