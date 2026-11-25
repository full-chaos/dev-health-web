import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_request", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../_request")>()),
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

const inactive = {
    ...served,
    id: "00000000-0000-4000-8000-0000000000d2",
    canonical_id: "bob@example.invalid",
    display_name: "Bob Example",
    is_active: false,
};

// The served routes are GET and POST /identities only (ops teamsidentity.go:96-98).
function serveOnlyTheListRoute() {
    mockRequest.mockImplementation(async (path: string) => {
        const [pathname, query] = path.split("?");
        if (pathname === "/identities") {
            const activeOnly = new URLSearchParams(query ?? "").get("active_only") !== "false";
            return activeOnly ? [served].filter((row) => row.is_active) : [served, inactive];
        }
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

    it("get finds a deactivated identity (the list names it with active_only=false)", async () => {
        const found = await identitiesApi.get("bob@example.invalid");
        expect(found.is_active).toBe(false);
    });

    it("get takes the route parameter still encoded", async () => {
        const found = await identitiesApi.get(encodeURIComponent("bob@example.invalid"));
        expect(found.canonical_id).toBe("bob@example.invalid");
    });

    it("get of an identity the list does not hold is a 404 error (the page's not-found state)", async () => {
        await expect(identitiesApi.get("nobody-example")).rejects.toMatchObject({ status: 404 });
    });

    it("control: list returns the served identities", async () => {
        const list = await identitiesApi.list();
        expect(list).toHaveLength(1);
    });
});
