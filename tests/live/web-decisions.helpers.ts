import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { envFault } from "./helpers";

// The web server of the decisions pass writes its stdout (JSON lines) to LIVE_WEB_LOG. One line is one decision of the
// decision client; the field set is closed (guard, action, allowed, source, reason_code, request_id): no token, no org id.

export interface DecisionLine {
    guard: string;
    action: string;
    allowed: boolean;
    source: string;
    reason_code: string;
    request_id?: string;
    time?: number;
}

export function webLogPath(): string {
    const path = process.env.LIVE_WEB_LOG ?? "web-decisions-logs/web-server.log";
    try {
        statSync(path);
    } catch {
        envFault(
            `the web server log ${path} does not exist: the decisions pass must start the server itself`,
        );
    }
    return path;
}

function lines(path: string): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    for (const raw of readFileSync(path, "utf8").split("\n")) {
        if (!raw.startsWith("{")) continue;
        try {
            out.push(JSON.parse(raw) as Record<string, unknown>);
        } catch {
            // A partial line at the end of a file that is still written.
        }
    }
    return out;
}

function named(path: string, message: string): Record<string, unknown>[] {
    return lines(path).filter((l) => (l.msg ?? l.message) === message);
}

/** How many decision lines the log holds now: take it before an action, pass it to decisionsSince after. */
export function mark(path: string): number {
    return named(path, "authz_decide").length;
}

export function decisionsSince(path: string, since: number, guard: string): DecisionLine[] {
    return named(path, "authz_decide")
        .slice(since)
        .filter((l) => l.guard === guard) as unknown as DecisionLine[];
}

export function shadowRuns(path: string): number {
    return named(path, "authz_shadow_decide").length;
}

export function decideLines(path: string): number {
    return named(path, "authz_decide").length;
}

/** authz_decide lines whose verdict came from the PDP: a legacy pass must log none. */
export function pdpDecideLines(path: string): number {
    return named(path, "authz_decide").filter((l) => l.source === "pdp").length;
}

/**
 * authz_decide lines from the decision client (source pdp or client) after the mark, for the given guards or actions (all when
 * none are given): an enforce-off pass must log none.
 */
export function decisionClientLines(path: string, since = 0, names?: readonly string[]): number {
    return named(path, "authz_decide")
        .slice(since)
        .filter(
            (l) =>
                (l.source === "pdp" || l.source === "client") &&
                (names === undefined ||
                    names.includes(String(l.guard ?? "")) ||
                    names.includes(String(l.action ?? ""))),
        ).length;
}

/** authz_shadow_decide runs that asked at least one of the given surface ids (the platform shadow of AUTHZ_PLATFORM_UI). */
export function shadowRunsOf(path: string, surfaces: readonly string[]): number {
    return named(path, "authz_shadow_decide").filter((l) =>
        String(l.surfaces ?? "")
            .split(",")
            .some((s) => surfaces.includes(s)),
    ).length;
}

/** The next decision of guard after the mark, polled: the server writes the line while it answers. */
export async function nextDecision(
    path: string,
    since: number,
    guard: string,
): Promise<DecisionLine> {
    let found: DecisionLine | undefined;
    await expect
        .poll(
            () => {
                found = decisionsSince(path, since, guard)[0];
                return found !== undefined;
            },
            { message: `no authz_decide line for ${guard} after the action`, timeout: 20_000 },
        )
        .toBe(true);
    return found as DecisionLine;
}

/** Sign a registered user in through the real Auth.js browser flow. */
export async function signInUser(page: Page, email: string, password: string): Promise<void> {
    await page.goto("/auth/signin");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    const callback = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/auth/callback/credentials" &&
            response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign In" }).click();
    expect((await callback).ok(), `${email} could not sign in`).toBe(true);
    await expect
        .poll(async () => {
            const response = await page.request.get("/api/auth/session");
            if (!response.ok()) return "";
            const body = (await response.json()) as { user?: { email?: string } };
            return body.user?.email ?? "";
        })
        .toBe(email);
}

/** The subject token file the web server exchanges (the ops stack writes it; the fake TokenReview knows only its first content). */
export function workloadSubjectFile(): string {
    const state = process.env.LIVE_E2E_STACK_STATE;
    if (!state) {
        envFault("LIVE_E2E_STACK_STATE names the ops auth stack state directory");
        return "";
    }
    return join(state, "workload", "web.subject");
}

/** A JWS-shaped subject token that no issuer signed, with exp at now + expInSeconds. */
export function foreignSubjectJws(expInSeconds: number): string {
    const part = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    return [
        part({ alg: "RS256", typ: "JWT" }),
        part({
            iss: "https://kubernetes.default.svc.cluster.local",
            sub: "system:serviceaccount:live-e2e:web",
            aud: ["dev-health-workload-exchange"],
            iat: now,
            exp: now + expInSeconds,
        }),
        randomBytes(64).toString("base64url"),
    ].join(".");
}

export function sha256Hex(data: Buffer): string {
    return createHash("sha256").update(data).digest("hex");
}

/** stop-auth or start-auth of the ops live e2e auth stack script (the outage cell). */
export function stack(verb: "stop-auth" | "start-auth"): void {
    const script = process.env.LIVE_E2E_STACK_SCRIPT;
    const state = process.env.LIVE_E2E_STACK_STATE;
    if (!script || !state) {
        envFault(
            "LIVE_E2E_STACK_SCRIPT and LIVE_E2E_STACK_STATE name the ops auth stack script and its state directory",
        );
        return;
    }
    execFileSync("bash", [script, verb, state], { stdio: "pipe", timeout: 90_000 });
}

const DECIDE = "authz_decide";
const DECIDE_TIMEOUT = "authz_decide_timeout";
const EXCHANGED = "workload token exchanged";
const EXCHANGE_FAILED = "workload token exchange failed";
const TIMELINE = new Set([DECIDE, DECIDE_TIMEOUT, EXCHANGED, EXCHANGE_FAILED]);
const TIMELINE_SKIP = new Set(["level", "time", "pid", "hostname", "msg", "message"]);

const msgOf = (l: Record<string, unknown>) => String(l.msg ?? l.message ?? "");
const iso = (ms: unknown) => (typeof ms === "number" ? new Date(ms).toISOString() : "?");

/** How many JSON lines the log holds now (all messages): the mark of linesSince and the recovery checks. */
export function markLines(path: string): number {
    return lines(path).length;
}

function linesSince(path: string, since: number): Record<string, unknown>[] {
    return lines(path).slice(since);
}

/**
 * The decision, timeout and workload exchange lines after the mark, one per row with its server time, plus the test
 * events (written by the test clock): every recovery assertion carries it.
 */
export function timeline(
    path: string,
    since: number,
    events: readonly { label: string; atMs: number }[],
): string {
    const rows = [
        ...events.map((e) => ({ at: e.atMs, text: `${iso(e.atMs)} test: ${e.label}` })),
        ...linesSince(path, since)
            .filter((l) => TIMELINE.has(msgOf(l)))
            .map((l) => {
                const rest = Object.fromEntries(
                    Object.entries(l).filter(([k]) => !TIMELINE_SKIP.has(k)),
                );
                return {
                    at: typeof l.time === "number" ? l.time : 0,
                    text: `${iso(l.time)} server: ${msgOf(l)} ${JSON.stringify(rest)}`,
                };
            }),
    ].sort((a, b) => a.at - b.at);
    return ["timeline:", ...rows.map((r) => `  ${r.text}`)].join("\n");
}

async function pollLine(
    path: string,
    since: number,
    match: (l: Record<string, unknown>) => boolean,
    missing: string,
    show: () => string,
): Promise<{ line: Record<string, unknown>; index: number }> {
    let found: { line: Record<string, unknown>; index: number } | undefined;
    try {
        await expect
            .poll(
                () => {
                    const all = linesSince(path, since);
                    const i = all.findIndex(match);
                    found = i < 0 ? undefined : { line: all[i], index: since + i };
                    return found !== undefined;
                },
                { timeout: 20_000 },
            )
            .toBe(true);
    } catch {
        throw new Error(`missing signal: ${missing}\n${show()}`);
    }
    return found as { line: Record<string, unknown>; index: number };
}

/**
 * After a fault ends (subject restored, auth-service started): the next decision of guard is the PDP's allow, or, on the
 * cold path only, a LOUD fail-closed timeout. That timeout must carry its authz_decide_timeout line, the server must log
 * the workload token recovery when an exchange failed during the fault, and the decision after that line must be the
 * PDP's allow. No sleep: each step waits for a named line.
 */
export async function expectRecovered(
    page: Page,
    path: string,
    opts: {
        guard: string;
        action: string;
        url: string;
        faultMark: number;
        events: { label: string; atMs: number }[];
        requireExchange: boolean;
    },
): Promise<void> {
    const { guard, action, faultMark, events } = opts;
    const show = () => timeline(path, faultMark, events);
    const decision = (l: Record<string, unknown>) => msgOf(l) === DECIDE && l.guard === guard;
    const failedDuringFault = linesSince(path, faultMark).some((l) => msgOf(l) === EXCHANGE_FAILED);
    const needRecoveryLine = opts.requireExchange || failedDuringFault;
    const recovered = (since: number) =>
        pollLine(
            path,
            since,
            (l) => msgOf(l) === EXCHANGED && l.recovered === true,
            `no "${EXCHANGED}" line with recovered=true after the fault ended`,
            show,
        );

    const first = markLines(path);
    events.push({ label: `goto ${opts.url} (D1)`, atMs: Date.now() });
    await page.goto(opts.url);
    const d1 = await pollLine(path, first, decision, `no ${DECIDE} line for ${guard} (D1)`, show);
    const d1Line = d1.line as unknown as DecisionLine;
    expect(d1Line.action, show()).toBe(action);

    if (d1Line.source === "pdp") {
        expect(
            d1Line.allowed,
            `D1 is a PDP deny after the fault: ${d1Line.reason_code}\n${show()}`,
        ).toBe(true);
        if (needRecoveryLine) {
            const rec = await recovered(faultMark);
            expect(rec.index < d1.index, `the recovery line came after D1\n${show()}`).toBe(true);
        }
        return;
    }

    expect(
        d1Line.reason_code,
        `D1 failed closed for a reason other than the cold-path timeout\n${show()}`,
    ).toBe("timeout");
    await pollLine(
        path,
        faultMark,
        (l) => msgOf(l) === DECIDE_TIMEOUT && l.request_id === d1Line.request_id,
        `no ${DECIDE_TIMEOUT} line for D1 (${String(d1Line.request_id)}): the timeout was silent`,
        show,
    );
    const rec = needRecoveryLine ? await recovered(faultMark) : undefined;
    const second = markLines(path);
    if (rec) expect(rec.index < second, `the recovery line is not before D2\n${show()}`).toBe(true);
    events.push({ label: `goto ${opts.url} (D2)`, atMs: Date.now() });
    await page.goto(opts.url);
    const d2 = await pollLine(path, second, decision, `no ${DECIDE} line for ${guard} (D2)`, show);
    const d2Line = d2.line as unknown as DecisionLine;
    expect(d2Line.action, show()).toBe(action);
    expect(d2Line.source, `D2 is not the PDP's after the loud D1 timeout\n${show()}`).toBe("pdp");
    expect(d2Line.allowed, `D2 is a PDP deny: ${d2Line.reason_code}\n${show()}`).toBe(true);
}
