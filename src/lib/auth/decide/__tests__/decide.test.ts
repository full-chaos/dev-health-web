import { describe, expect, it, vi } from "vitest";
import { reasonToState } from "../../reasonStates";
import { decideGuard, type DecideDeps } from "../decide";
import {
    ALLOW,
    DENY,
    ORG,
    TOKEN,
    USER,
    answering,
    countingSession,
    decisionBody,
    recordingTransport,
    session,
} from "./helpers";

const log = () => ({ info: vi.fn() });
const on = (over: Partial<DecideDeps>): DecideDeps => ({
    enforced: true,
    transport: undefined,
    timeoutMs: 1500,
    log: log(),
    ...over,
});

const UNAVAILABLE = reasonToState("transport_error").message;
const DENIED = reasonToState("role_lacks_action").message;

describe("A1 the decision point verdict is the only one read when the switch is on", () => {
    it("legacy allows, the decision point denies: deny", async () => {
        const { transport, calls } = answering(DENY);
        const out = await decideGuard(
            session({ is_superuser: true }),
            "platform.orgs",
            on({ transport }),
        );
        expect(out.allowed).toBe(false);
        expect(calls).toHaveLength(1);
    });

    it("legacy denies, the decision point allows: allow", async () => {
        const { transport, calls } = answering(ALLOW);
        const out = await decideGuard(
            session({ is_superuser: false, role: "member" }),
            "platform.orgs",
            on({ transport }),
        );
        expect(out).toEqual({ allowed: true });
        expect(calls).toHaveLength(1);
    });

    it.each(["platform.orgs", "platform.users", "org.integrations.write"] as const)(
        "%s never reads a client role field when on",
        async (guard) => {
            const { transport } = answering(ALLOW);
            const { session: s, reads } = countingSession({ is_superuser: true, role: "owner" });
            const out = await decideGuard(s, guard, on({ transport }));
            expect(out.allowed).toBe(true);
            expect(reads()).toBe(0);
        },
    );

    it("org guard: a member the decision point allows is allowed", async () => {
        const { transport } = answering(ALLOW);
        const out = await decideGuard(
            session({ role: "member" }),
            "org.integrations.write",
            on({ transport }),
        );
        expect(out).toEqual({ allowed: true });
    });

    it("an unmapped guard keeps the client rule even when on, and asks nothing", async () => {
        const { transport, calls } = answering(DENY);
        const yes = await decideGuard(
            session({ is_superuser: true }),
            "unmapped",
            on({ transport }),
        );
        const no = await decideGuard(
            session({ is_superuser: false }),
            "unmapped",
            on({ transport }),
        );
        expect(yes.allowed).toBe(true);
        expect(no.allowed).toBe(false);
        expect(calls).toHaveLength(0);
    });
});

describe("switch off: the client rule, nothing asked", () => {
    it.each([
        ["platform.orgs", { is_superuser: true }, true],
        ["platform.orgs", { is_superuser: false, role: "owner" }, false],
        ["platform.users", { is_superuser: true }, true],
        ["platform.users", { is_superuser: false }, false],
        ["org.integrations.write", { role: "admin" }, true],
        ["org.integrations.write", { role: "owner" }, true],
        ["org.integrations.write", { role: "member" }, false],
        ["org.integrations.write", { is_superuser: true, role: "member" }, true],
        ["unmapped", { is_superuser: true }, true],
        ["unmapped", { is_superuser: false }, false],
    ] as const)("%s %j -> %s", async (guard, user, want) => {
        const { transport, calls } = answering(ALLOW);
        const out = await decideGuard(session(user), guard, {
            enforced: false,
            transport,
            timeoutMs: 1500,
            log: log(),
        });
        expect(out.allowed).toBe(want);
        expect(calls).toHaveLength(0);
    });

    it("logs nothing", async () => {
        const l = log();
        await decideGuard(session({ is_superuser: true }), "platform.orgs", {
            enforced: false,
            transport: undefined,
            timeoutMs: 1500,
            log: l,
        });
        expect(l.info).not.toHaveBeenCalled();
    });
});

interface Row {
    name: string;
    deps: () => Partial<DecideDeps>;
    session?: Parameters<typeof session>;
    guard?: "platform.orgs" | "org.integrations.write";
}

const hang = () => recordingTransport(() => new Promise(() => undefined));
const reply = (status: number, body: string) => recordingTransport(async () => ({ status, body }));

const rows: Row[] = [
    { name: "transport missing", deps: () => ({ transport: undefined }) },
    {
        name: "transport throws",
        deps: () => ({
            transport: recordingTransport(async () => {
                throw new Error("boom " + TOKEN);
            }).transport,
        }),
    },
    { name: "timeout", deps: () => ({ transport: hang().transport, timeoutMs: 20 }) },
    { name: "non-200 (500)", deps: () => ({ transport: reply(500, "{}").transport }) },
    {
        name: "non-200 (403) with an allow body",
        deps: () => ({ transport: reply(403, decisionBody(ALLOW)).transport }),
    },
    { name: "bad JSON", deps: () => ({ transport: reply(200, "not json").transport }) },
    {
        name: "unknown reason",
        deps: () => ({
            transport: reply(200, decisionBody({ allowed: true, reason: "allowed_by_vibes" }))
                .transport,
        }),
    },
    {
        name: "expired decision",
        deps: () => ({
            transport: reply(200, decisionBody({ ...ALLOW, expiresAt: "2001-01-01T00:00:00Z" }))
                .transport,
        }),
    },
    {
        name: "allowed with a deny reason",
        deps: () => ({
            transport: reply(200, decisionBody({ allowed: true, reason: "role_lacks_action" }))
                .transport,
        }),
    },
    {
        name: "no access token",
        deps: () => ({ transport: answering(ALLOW).transport }),
        session: [{ is_superuser: true }, null],
    },
    {
        name: "org action without an org id",
        deps: () => ({ transport: answering(ALLOW).transport }),
        session: [{ is_superuser: true, role: "owner", org_id: null }],
        guard: "org.integrations.write",
    },
    {
        name: "org id the request builder refuses (invalid_request)",
        deps: () => ({ transport: answering(ALLOW).transport }),
        session: [{ is_superuser: true, role: "owner", org_id: "Bad Org" }],
        guard: "org.integrations.write",
    },
    {
        name: "the decision point answers invalid_request",
        deps: () => ({
            transport: reply(200, decisionBody({ allowed: false, reason: "invalid_request" }))
                .transport,
        }),
    },
];

describe("B1 every failure path denies, switch on, legacy would allow", () => {
    it.each(rows)("$name", async (row) => {
        const args = row.session ?? [{ is_superuser: true, role: "owner" }];
        const out = await decideGuard(
            session(...(args as Parameters<typeof session>)),
            row.guard ?? "platform.orgs",
            on(row.deps()),
        );
        expect(out.allowed).toBe(false);
    });

    it("does not throw when the logger throws", async () => {
        const out = await decideGuard(
            session({ is_superuser: true }),
            "platform.orgs",
            on({
                transport: answering(ALLOW).transport,
                log: {
                    info: () => {
                        throw new Error("log down");
                    },
                },
            }),
        );
        expect(out.allowed).toBe(false);
    });

    it("a request the client refuses never reaches the transport", async () => {
        const { transport, calls } = answering(ALLOW);
        await decideGuard(
            session({ role: "owner", org_id: "Bad Org" }),
            "org.integrations.write",
            on({ transport }),
        );
        expect(calls).toHaveLength(0);
    });
});

describe("B2 a deny carries a safe sentence, never the wire code or a decision id", () => {
    it("pdp deny", async () => {
        const out = await decideGuard(
            session({ is_superuser: true }),
            "platform.orgs",
            on({ transport: answering(DENY).transport }),
        );
        expect(out).toEqual({ allowed: false, message: DENIED });
    });

    it.each(rows)("$name", async (row) => {
        const args = row.session ?? [{ is_superuser: true, role: "owner" }];
        const out = await decideGuard(
            session(...(args as Parameters<typeof session>)),
            row.guard ?? "platform.orgs",
            on(row.deps()),
        );
        if (out.allowed) throw new Error("expected deny");
        expect(out.message).not.toMatch(/role_lacks_action|invalid_request|dec_|timeout|non_200/);
        expect(out.message).not.toContain(TOKEN);
        expect(Object.keys(out).sort()).toEqual(["allowed", "message"]);
    });

    it("a failure to get an answer says unavailable", async () => {
        const out = await decideGuard(
            session({ is_superuser: true }),
            "platform.orgs",
            on({ transport: undefined }),
        );
        expect(out).toEqual({ allowed: false, message: UNAVAILABLE });
    });
});

describe("B3 a failure never falls back to the legacy verdict", () => {
    it("transport missing, legacy allows: deny", async () => {
        const { session: s, reads } = countingSession({ is_superuser: true, role: "owner" });
        const out = await decideGuard(s, "platform.orgs", on({ transport: undefined }));
        expect(out.allowed).toBe(false);
        expect(reads()).toBe(0);
    });

    it("transport throws, legacy allows: deny", async () => {
        const { session: s, reads } = countingSession({ is_superuser: true, role: "owner" });
        const out = await decideGuard(
            s,
            "org.integrations.write",
            on({
                transport: recordingTransport(async () => {
                    throw new Error("x");
                }).transport,
            }),
        );
        expect(out.allowed).toBe(false);
        expect(reads()).toBe(0);
    });

    it("the session user id and org id are never sent as the principal", async () => {
        const { transport, calls } = answering(ALLOW);
        await decideGuard(session({ role: "owner" }), "org.integrations.write", on({ transport }));
        const sent = JSON.parse(calls[0]?.body ?? "{}") as { principal_reference: string };
        expect(sent.principal_reference).toBe(TOKEN);
        expect(calls[0]?.body).not.toContain(USER);
        expect(ORG).toBe("org-1");
    });
});
