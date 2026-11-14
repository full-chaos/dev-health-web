import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";

vi.mock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({ access_token: "tok", user: { org_id: "org-1" } }),
    forgetOwnImpersonationStatus: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import { handlers } from "../../../../../tests/mocks/handlers";
import { discoverTeams } from "../teams";

const mockServer = setupServer(...handlers);

beforeAll(() => mockServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe("real discoverTeams on a provider-refused 422", () => {
    it("keeps status 422, swaps the served text for the read message", async () => {
        const result = await discoverTeams("refused-token");
        expect(result).toEqual({ error: READ_FAILED_MESSAGE, status: 422 });
        expect(JSON.stringify(result)).not.toContain("SERVED-REFUSED-TOKEN-DETAIL");
    });
});
