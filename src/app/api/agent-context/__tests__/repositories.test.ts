import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/acr/service", () => ({
    listAuthorizedRepositories: vi.fn(),
}));
vi.mock("@/lib/admin/server", () => ({
    getCurrentOrg: vi.fn(),
}));

import { AcrRuntimeError, acrRuntimeErrorCodes } from "@/lib/acr/errors";
import { getCurrentOrg } from "@/lib/admin/server";
import { listAuthorizedRepositories } from "@/lib/acr/service";
import { GET } from "../repositories/route";

describe("repository catalog route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getCurrentOrg).mockResolvedValue({
            data: {
                created_at: "2026-07-17T00:00:00.000Z",
                description: null,
                id: "org-1",
                is_active: true,
                name: "Full Chaos",
                settings: {},
                slug: "full-chaos",
                tier: "community",
                updated_at: "2026-07-17T00:00:00.000Z",
            },
        });
    });

    it("returns the server-authorized repository catalog without caching", async () => {
        vi.mocked(listAuthorizedRepositories).mockResolvedValue(["full-chaos/dev-health-acr"]);

        const response = await GET();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual({ repositories: ["full-chaos/dev-health-acr"] });
        expect(listAuthorizedRepositories).toHaveBeenCalledWith("org-1");
    });

    it("sanitizes repository discovery failures without exposing runtime details", async () => {
        vi.mocked(listAuthorizedRepositories).mockRejectedValue(
            new AcrRuntimeError(acrRuntimeErrorCodes.upstream, "credential=do-not-leak", {
                retryable: true,
                status: 503,
            }),
        );

        const response = await GET();

        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain("credential=do-not-leak");
    });
});
