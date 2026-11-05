import { describe, expect, it, vi } from "vitest";
import type { Transport } from "../../authorize/client";
import { decideGuard } from "../decide";
import { ALLOW, DENY, ORG, TOKEN, USER, answering, session } from "./helpers";

const CLOSED = ["guard", "action", "allowed", "source", "reason_code", "request_id"] as const;

async function logged(transport: Transport | undefined) {
    const info = vi.fn();
    await decideGuard(session({ role: "owner", is_superuser: true }), "org.integrations.write", {
        enforced: true,
        transport,
        timeoutMs: 1500,
        log: { info },
    });
    return info;
}

describe("C2 the decision log holds a closed field set", () => {
    it.each([
        ["allow", answering(ALLOW).transport],
        ["deny", answering(DENY).transport],
        ["no transport", undefined],
    ] as const)("%s: one line, closed fields, no token, no user id, no org id", async (_n, t) => {
        const info = await logged(t);
        expect(info).toHaveBeenCalledTimes(1);
        const [fields, message] = info.mock.calls[0] as [Record<string, unknown>, string];
        expect(message).toBe("authz_decide");
        for (const key of Object.keys(fields)) expect(CLOSED as readonly string[]).toContain(key);
        expect(fields.guard).toBe("org.integrations.write");
        expect(fields.action).toBe("integrations.write");
        const text = JSON.stringify(info.mock.calls);
        expect(text).not.toContain(TOKEN);
        expect(text).not.toContain(USER);
        expect(text).not.toContain(`"${ORG}"`);
        expect(text).not.toMatch(/principal|access_token/i);
    });

    it("a decision line carries the wire reason and request id, never the decision id", async () => {
        const info = await logged(answering(DENY).transport);
        const fields = info.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(fields.allowed).toBe(false);
        expect(fields.source).toBe("pdp");
        expect(fields.reason_code).toBe("role_lacks_action");
        expect(fields).not.toHaveProperty("decision_id");
        expect(fields.request_id).toMatch(/^req_/);
    });

    it("a principal-like decision id from the transport never reaches a log line", async () => {
        const principalLike = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const transport: Transport = async () => ({
            status: 200,
            body: JSON.stringify({
                schema_version: "authorization_decision.v1",
                decision_id: `dec_${principalLike}`,
                allowed: false,
                reason_code: DENY.reason,
                principal_id: "prn_EXAMPLE0000000000000001",
                organization_id: ORG,
                policy_revision: 1,
                expires_at: "2099-01-01T00:00:00Z",
            }),
        });
        const info = await logged(transport);
        expect(info).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(info.mock.calls)).not.toContain(principalLike);
        expect(Object.keys(info.mock.calls[0]?.[0] as object)).not.toContain("decision_id");
    });

    it("a failure line says client and names the local reason", async () => {
        const info = await logged(undefined);
        const fields = info.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(fields.allowed).toBe(false);
        expect(fields.source).toBe("client");
        expect(typeof fields.reason_code).toBe("string");
    });
});
