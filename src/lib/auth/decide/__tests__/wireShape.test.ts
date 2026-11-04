import { describe, expect, it, vi } from "vitest";
import { decideGuard } from "../decide";
import { ALLOW, ORG, TOKEN, answering, session } from "./helpers";

interface Wire {
    schema_version: string;
    principal_reference: string;
    action: string;
    resource: { type: string; key: string; organization_id?: string };
    context: { request_id: string; client_service: string };
}

const run = async (guard: "platform.orgs" | "platform.users" | "org.integrations.write") => {
    const { transport, calls } = answering(ALLOW);
    await decideGuard(session({ role: "owner", is_superuser: true }), guard, {
        enforced: true,
        transport,
        timeoutMs: 1500,
        log: { info: vi.fn() },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe("/v1/authorize");
    return JSON.parse(calls[0]?.body ?? "{}") as Wire;
};

describe("C4 the request on the wire", () => {
    it.each([
        ["platform.orgs", "admin.orgs"],
        ["platform.users", "admin.users"],
    ] as const)("%s is a platform request with no organization_id", async (guard, action) => {
        const wire = await run(guard);
        expect(wire.action).toBe(action);
        expect(wire.resource).toEqual({ type: "platform", key: "platform" });
        expect(wire.resource).not.toHaveProperty("organization_id");
        expect(wire.principal_reference).toBe(TOKEN);
    });

    it("org.integrations.write is an organization request that carries the session org", async () => {
        const wire = await run("org.integrations.write");
        expect(wire.action).toBe("integrations.write");
        expect(wire.resource).toEqual({ type: "organization", key: ORG, organization_id: ORG });
        expect(wire.principal_reference).toBe(TOKEN);
        expect(wire.context.request_id).toMatch(/^req_[A-Za-z0-9_-]{26}$/);
        expect(wire.context.client_service).toBe("dev-health-web");
    });
});
