/**
 * Contract test: identitiesApi.update must issue POST /identities (the
 * supported create_or_update upsert) with the FULL desired state \u2014
 * canonical_id + complete team_ids/provider_identities \u2014 rather than
 * PATCH /identities/{id}, which does not exist on the backend
 * (dev_health_ops/api/admin/routers/identities.py only registers
 * GET/POST /identities).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../_request", () => ({
    request: vi.fn().mockResolvedValue({}),
}));

import { request } from "../_request";
import { identitiesApi } from "../identities";
import type { IdentityMappingCreate } from "../../types";

const mockRequest = vi.mocked(request);

beforeEach(() => {
    mockRequest.mockClear();
});

describe("identitiesApi.update path contract", () => {
    it("issues POST /identities (not PATCH /identities/:id)", async () => {
        const payload: IdentityMappingCreate = {
            canonical_id: "alice-smith",
            display_name: "Alice Smith",
            email: null,
            provider_identities: { github: ["octocat"] },
            team_ids: ["eng", "design"],
        };

        await identitiesApi.update(payload);

        expect(mockRequest).toHaveBeenCalledOnce();
        const [path, options] = mockRequest.mock.calls[0];
        expect(path).toBe("/identities");
        expect((options as RequestInit).method).toBe("POST");
    });

    it("sends the full canonical_id + team_ids in the request body (no partial diff)", async () => {
        const payload: IdentityMappingCreate = {
            canonical_id: "alice-smith",
            team_ids: ["eng", "design"],
            provider_identities: { github: ["octocat"] },
        };

        await identitiesApi.update(payload);

        const [, options] = mockRequest.mock.calls[0];
        const sentBody = JSON.parse((options as RequestInit).body as string);
        expect(sentBody.canonical_id).toBe("alice-smith");
        expect(sentBody.team_ids).toEqual(["eng", "design"]);
    });

    it("uses the same POST /identities path as create (both hit the upsert route)", async () => {
        await identitiesApi.create({ canonical_id: "bob" });
        await identitiesApi.update({ canonical_id: "bob", team_ids: [] });

        expect(mockRequest.mock.calls[0][0]).toBe("/identities");
        expect(mockRequest.mock.calls[1][0]).toBe("/identities");
        expect((mockRequest.mock.calls[0][1] as RequestInit).method).toBe("POST");
        expect((mockRequest.mock.calls[1][1] as RequestInit).method).toBe("POST");
    });
});
