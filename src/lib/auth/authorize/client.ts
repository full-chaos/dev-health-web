import "server-only";
import { parseBatch, parseDecision, type Decision, type ParseFailure } from "./decision";
import { buildRequestBody, type AuthorizeRequest } from "./request";

// Server-only policy decision client. Every path that is not a valid, unexpired PDP answer is a
// deny. The transport and the time bound are required arguments: no module default exists that
// could allow, and the production module holds no deny-default double (tests own it).

export interface TransportCall {
    path: "/v1/authorize" | "/v1/authorize:batch";
    body: string;
}
export interface TransportReply {
    status: number;
    body: string;
}
export type Transport = (call: TransportCall) => Promise<TransportReply>;

export interface AuthorizeDeps {
    transport: Transport;
    timeoutMs: number;
    nowSeconds?: () => number;
}

// A client-side failure. Separate from a wire reason_code, so a caller tells a PDP deny from a
// failure to obtain one.
export type LocalDenyReason =
    | ParseFailure
    | "invalid_request"
    | "internal_error"
    | "batch_bound"
    | "transport_error"
    | "timeout"
    | "non_200";

export type AuthzOutcome =
    | { allowed: true; decision: Decision }
    | { allowed: false; source: "pdp"; decision: Decision }
    | { allowed: false; source: "client"; reason: LocalDenyReason };

const MAX_BATCH = 100;

const clientDeny = (reason: LocalDenyReason): AuthzOutcome => ({
    allowed: false,
    source: "client",
    reason,
});

const fromDecision = (decision: Decision): AuthzOutcome =>
    decision.allowed ? { allowed: true, decision } : { allowed: false, source: "pdp", decision };

type Exchange = { ok: true; body: string } | { ok: false; reason: LocalDenyReason };

async function exchange(deps: AuthorizeDeps, call: TransportCall): Promise<Exchange> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), deps.timeoutMs);
    });
    try {
        const reply = await Promise.race([deps.transport(call), timeout]);
        if (reply === "timeout") return { ok: false, reason: "timeout" };
        if (reply.status !== 200) return { ok: false, reason: "non_200" };
        return { ok: true, body: reply.body };
    } catch {
        return { ok: false, reason: "transport_error" };
    } finally {
        clearTimeout(timer);
    }
}

const now = (deps: AuthorizeDeps): number =>
    deps.nowSeconds ? deps.nowSeconds() : Math.floor(Date.now() / 1000);

export async function authorize(
    request: AuthorizeRequest,
    deps: AuthorizeDeps,
): Promise<AuthzOutcome> {
    try {
        const body = buildRequestBody(request);
        if (!body) return clientDeny("invalid_request");
        const ex = await exchange(deps, { path: "/v1/authorize", body: JSON.stringify(body) });
        if (!ex.ok) return clientDeny(ex.reason);
        const parsed = parseDecision(ex.body, now(deps));
        return parsed.ok ? fromDecision(parsed.decision) : clientDeny(parsed.reason);
    } catch {
        return clientDeny("internal_error");
    }
}

export async function authorizeBatch(
    requests: readonly AuthorizeRequest[],
    deps: AuthorizeDeps,
): Promise<AuthzOutcome[]> {
    const denyAll = (reason: LocalDenyReason): AuthzOutcome[] =>
        requests.map(() => clientDeny(reason));
    try {
        if (requests.length === 0) return [];
        if (requests.length > MAX_BATCH) return denyAll("batch_bound");
        const bodies: Record<string, unknown>[] = [];
        for (const r of requests) {
            const b = buildRequestBody(r);
            if (!b) return denyAll("invalid_request");
            bodies.push(b);
        }
        const payload = JSON.stringify({
            schema_version: "authorization_batch_request.v1",
            requests: bodies,
        });
        const ex = await exchange(deps, { path: "/v1/authorize:batch", body: payload });
        if (!ex.ok) return denyAll(ex.reason);
        const parsed = parseBatch(ex.body, requests.length, now(deps));
        return parsed.ok ? parsed.decisions.map(fromDecision) : denyAll(parsed.reason);
    } catch {
        return denyAll("internal_error");
    }
}
