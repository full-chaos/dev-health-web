import { beforeEach, describe, expect, it, vi } from "vitest";
import { SURFACES } from "../catalog";
import { buildShadowRequest, shadowDecide, type ShadowInput } from "../run";
import { ALLOW, ORG, TOKEN, input, recordingTransport } from "./helpers";

const log = () => ({ info: vi.fn() });
const asInput = (over: Record<string, unknown> = {}) => input(over) as ShadowInput;
const REQ_ID = "req_AAAAAAAAAAAAAAAAAAAAAAAAAA";

interface WireItem {
    resource: { type: string; key: string; organization_id?: string };
}

const asked = (calls: { body: string }[]): WireItem[] =>
    calls.flatMap((c) => (JSON.parse(c.body) as { requests: WireItem[] }).requests);

describe("org-scoped shadow rows carry the session organization", () => {
    beforeEach(() => vi.useRealTimers());

    const orgRows = SURFACES.filter((s) => s.request?.resource === "organization");

    it("has at least one org-scoped row to check", () => {
        expect(orgRows.length).toBeGreaterThan(0);
    });

    it.each(orgRows.map((s) => [s.id]))("sends organization_id on %s", async (id) => {
        const { transport, calls } = recordingTransport([ALLOW]);
        const r = await shadowDecide(asInput({ surfaceIds: [id] }), { transport, log: log() });
        expect(r.status).toBe("ran");
        const items = asked(calls);
        expect(items).toHaveLength(1);
        expect(items[0]?.resource.type).toBe("organization");
        expect(items[0]?.resource.organization_id).toBe(ORG);
    });

    it("sends no organization_id on a row of any platform-scoped request", () => {
        const req = buildShadowRequest(
            { action: "admin.users", resource: "platform" },
            { orgId: ORG, principalReference: TOKEN, requestId: REQ_ID },
        );
        expect(req).not.toBeNull();
        expect(req?.resource.type).toBe("platform");
        expect(req?.resource.organizationId).toBeUndefined();
    });

    it("sets organizationId on an org-scoped request", () => {
        const req = buildShadowRequest(
            { action: "integrations.read", resource: "organization" },
            { orgId: ORG, principalReference: TOKEN, requestId: REQ_ID },
        );
        expect(req?.resource.organizationId).toBe(ORG);
    });

    it("builds no org-scoped request without an organization", () => {
        expect(
            buildShadowRequest(
                { action: "integrations.read", resource: "organization" },
                { orgId: undefined, principalReference: TOKEN, requestId: REQ_ID },
            ),
        ).toBeNull();
    });

    it("counts and does not send org rows for a session without an organization", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        const r = await shadowDecide(asInput({ orgId: undefined }), { transport, log: log() });
        expect(calls).toHaveLength(0);
        expect(r.status === "ran" && r.record.counts).toEqual({
            match: 0,
            mismatch: 0,
            unavailable: 0,
            no_action: 1,
        });
    });
});
