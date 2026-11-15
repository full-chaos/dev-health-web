import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    SUBJECT_CANARY,
    TOKEN_CANARY,
    answer,
    jsonResponse,
    jwt,
    setEnv,
    subjectFile,
} from "../../workload/__tests__/harness";
import { ALLOW, ORG, TOKEN, USER, decisionBody, session } from "./helpers";

// The live timeline of a subject restore, scaled 1/10: a cold good exchange (137 ms) plus a cold /v1/authorize (39 ms)
// overrun a 150 ms decide budget. The real decide, transport and workload token code run; only fetch is faked.

interface Line {
    level: string;
    msg: string;
    fields: Record<string, unknown>;
}
const lines: Line[] = [];
const push = (level: string) => (fields: Record<string, unknown>, msg: string) => {
    lines.push({ level, msg, fields });
};

vi.mock("@/lib/logger", () => {
    const logger = {
        trace: push("trace"),
        debug: push("debug"),
        info: push("info"),
        warn: push("warn"),
        error: push("error"),
        fatal: push("fatal"),
        child: () => logger,
    };
    return { logger };
});

const BUDGET_MS = 150;
const EXCHANGED = "workload token exchanged";
const FAILED = "workload token exchange failed";
const TIMEOUT = "authz_decide_timeout";
const DECIDE = "authz_decide";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stack(opts: { exchangeMs: number; authorizeMs: number; exchangeStatus?: () => number }) {
    return vi.fn(async (url: string) => {
        if (String(url).endsWith("/internal/v1/token/exchange")) {
            const status = opts.exchangeStatus?.() ?? 200;
            await sleep(status === 200 ? opts.exchangeMs : 1);
            return status === 200
                ? jsonResponse(answer(jwt(), 300))
                : jsonResponse({ error: "invalid_grant" }, status);
        }
        await sleep(opts.authorizeMs);
        return jsonResponse(decisionBody(ALLOW));
    });
}

async function load() {
    vi.resetModules();
    const { decideGuard } = await import("../decide");
    const { createAuthorizeTransport } = await import("../../authorize/transport");
    const transport = createAuthorizeTransport();
    return () =>
        decideGuard(session({ is_superuser: true }), "platform.orgs", {
            enforced: true,
            transport,
            timeoutMs: BUDGET_MS,
            log: { info: push("info"), warn: push("warn") },
        }).then(() => {
            const last = lines.filter((l) => l.msg === DECIDE).at(-1);
            if (!last) throw new Error("no authz_decide line");
            return last.fields;
        });
}

const index = (pred: (l: Line) => boolean) => lines.findIndex(pred);
const exchangeCalls = (f: ReturnType<typeof stack>) =>
    f.mock.calls.filter((c) => String(c[0]).endsWith("/exchange")).length;

beforeEach(() => {
    lines.length = 0;
    setEnv(subjectFile());
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe.sequential("cold exchange after a subject restore", () => {
    it("the cold decision times out LOUDLY, the recovery is logged, and the next decision is the PDP's", async () => {
        let n = 0;
        const fetchMock = stack({
            exchangeMs: 137,
            authorizeMs: 39,
            exchangeStatus: () => (++n <= 2 ? 400 : 200),
        });
        vi.stubGlobal("fetch", fetchMock);
        const decide = await load();

        const failed = [await decide(), await decide()];
        expect(failed.map((d) => d.reason_code)).toEqual(["transport_error", "transport_error"]);
        expect(
            lines.filter((l) => l.msg === FAILED).map((l) => l.fields.consecutive_failures),
        ).toEqual([1, 2]);

        const d1 = await decide();
        expect(d1.source).toBe("client");
        expect(d1.reason_code).toBe("timeout");
        const warn = lines.find((l) => l.msg === TIMEOUT);
        expect(warn?.level).toBe("warn");
        expect(warn?.fields.request_id).toBe(d1.request_id);
        expect(warn?.fields.budget_ms).toBe(BUDGET_MS);
        expect(warn?.fields.exchange_ms).toBeGreaterThanOrEqual(100);
        expect(warn?.fields.timeouts_total).toBe(1);

        await expect.poll(() => index((l) => l.msg === EXCHANGED), { timeout: 2_000 }).not.toBe(-1);
        const exchanged = lines[index((l) => l.msg === EXCHANGED)];
        expect(exchanged.level).toBe("info");
        expect(exchanged.fields.recovered).toBe(true);
        expect(exchanged.fields.failed_before).toBe(2);
        expect(exchanged.fields.recoveries_total).toBe(1);
        expect(exchanged.fields.duration_ms).toBeGreaterThanOrEqual(100);

        const recoveredAt = index((l) => l.msg === EXCHANGED);
        const d2 = await decide();
        expect(index((l) => l.fields.request_id === d2.request_id)).toBeGreaterThan(recoveredAt);
        expect(d2.source).toBe("pdp");
        expect(d2.allowed).toBe(true);
        expect(exchangeCalls(fetchMock)).toBe(3);
        expect(lines.filter((l) => l.msg === TIMEOUT)).toHaveLength(1);
    });

    it("warm path: the first decision is the PDP's, the exchange line says not recovered, no timeout line", async () => {
        vi.stubGlobal("fetch", stack({ exchangeMs: 5, authorizeMs: 5 }));
        const decide = await load();
        const d1 = await decide();
        expect(d1.source).toBe("pdp");
        const exchanged = lines.filter((l) => l.msg === EXCHANGED);
        expect(exchanged).toHaveLength(1);
        expect(exchanged[0].fields.recovered).toBe(false);
        expect(exchanged[0].fields.recoveries_total).toBe(0);
        expect(lines.filter((l) => l.msg === TIMEOUT)).toHaveLength(0);
    });

    it("a timeout with a cached token is logged with no exchange share", async () => {
        let slow = false;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => {
                if (String(url).endsWith("/exchange")) return jsonResponse(answer(jwt(), 300));
                await sleep(slow ? BUDGET_MS + 60 : 5);
                return jsonResponse(decisionBody(ALLOW));
            }),
        );
        const decide = await load();
        expect((await decide()).source).toBe("pdp");
        slow = true;
        const d = await decide();
        expect(d.reason_code).toBe("timeout");
        const warn = lines.find((l) => l.msg === TIMEOUT);
        expect(warn?.fields.exchange_ms).toBe(0);
    });

    it("the new lines carry durations and counts only: no token, subject, user or organization", async () => {
        let n = 0;
        vi.stubGlobal(
            "fetch",
            stack({
                exchangeMs: 137,
                authorizeMs: 39,
                exchangeStatus: () => (++n <= 1 ? 400 : 200),
            }),
        );
        const decide = await load();
        await decide();
        await decide();
        await expect.poll(() => index((l) => l.msg === EXCHANGED), { timeout: 2_000 }).not.toBe(-1);
        const allowed: Record<string, readonly string[]> = {
            [EXCHANGED]: ["duration_ms", "recovered", "failed_before", "recoveries_total"],
            [FAILED]: ["reason", "consecutive_failures"],
            [TIMEOUT]: [
                "guard",
                "action",
                "request_id",
                "budget_ms",
                "elapsed_ms",
                "exchange_ms",
                "timeouts_total",
            ],
        };
        for (const [msg, keys] of Object.entries(allowed)) {
            const seen = lines.filter((l) => l.msg === msg);
            expect(seen.length, msg).toBeGreaterThan(0);
            for (const l of seen)
                expect(Object.keys(l.fields).sort(), msg).toEqual([...keys].sort());
        }
        const text = JSON.stringify(lines);
        for (const secret of [TOKEN_CANARY, SUBJECT_CANARY, "subj-canary", TOKEN, USER, `"${ORG}"`])
            expect(text).not.toContain(secret);
        expect(text).not.toMatch(/principal|access_token|email/i);
    });
});
