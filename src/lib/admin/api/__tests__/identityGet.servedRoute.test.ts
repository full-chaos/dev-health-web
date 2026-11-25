import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_request", () => ({
    request: vi.fn(),
}));

import { request } from "../_request";
import { identitiesApi } from "../identities";

const mockRequest = vi.mocked(request);

const served = {
    id: "00000000-0000-4000-8000-0000000000d1",
    canonical_id: "alice-example",
    display_name: "Alice Example",
    email: null,
    provider_identities: { github: ["alice-example"] },
    team_ids: ["team-a"],
    is_active: true,
    created_at: "2026-01-01T00:00:00",
    updated_at: "2026-01-01T00:00:00",
};

// The served routes are GET and POST /identities only (ops teamsidentity.go:96-98).
function serveOnlyTheListRoute() {
    mockRequest.mockImplementation(async (path: string) => {
        if (path === "/identities") return [served];
        throw new Error(`404 Not Found: ${path}`);
    });
}

beforeEach(() => {
    mockRequest.mockReset();
    serveOnlyTheListRoute();
});

describe("the identity edit page reads an identity from the served routes", () => {
    it("get(canonical_id) finds the identity", async () => {
        const found = await identitiesApi.get("alice-example");
        expect(found.canonical_id).toBe("alice-example");
    });

    it("control: list returns the served identities", async () => {
        const list = await identitiesApi.list();
        expect(list).toHaveLength(1);
    });
});
